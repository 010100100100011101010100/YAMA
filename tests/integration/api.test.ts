import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { FalkorDB } from "falkordb";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getServerConfig } from "@/server/config";
import { privateGraphName } from "@/server/database/graph";
import { EvidenceWorker } from "@/server/evidence/worker";
import { EvidenceFiles } from "@/server/evidence/files";
import { anonymousSignIn } from "./anonymous-session";

process.loadEnvFile(".env.local");
const config = getServerConfig();
const owners: string[] = [];
let cookieA: string, cookieB: string, reportId: string, fileId: string, fileHash: string;
async function signIn() {
  const result = await anonymousSignIn(config.origin);
  if (!result.ok) throw new Error(`Anonymous session endpoint failed: HTTP ${result.status}`);
  const body = await result.json();
  owners.push(body.user.id);
  return result.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
}
async function call(path: string, cookie: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) {
  return fetch(`${config.origin}${path}`, { method, headers: { Cookie: cookie, Origin: config.origin, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function uploadFile(body: BodyInit, key = randomUUID(), extra: Record<string, string> = {}) {
  return fetch(`${config.origin}/api/reports/${reportId}/evidence`, { method: "POST", headers: { Cookie: cookieA, Origin: config.origin, "Content-Type": "text/plain", "X-File-Name": "record.txt", "Idempotency-Key": key, ...extra }, body });
}
beforeAll(async () => {
  const health = await fetch(`${config.origin}/api/health`);
  if (!health.ok) throw new Error("Start initialized databases and npm run dev before API integration tests.");
  cookieA = await signIn(); cookieB = await signIn();
});
afterAll(async () => {
  if (!owners.length) return;
  const mongo = new MongoClient("mongodb://127.0.0.1:27018/?directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin", serverSelectionTimeoutMS: 5000 });
  try {
    const database = mongo.db(config.mongoDatabase);
    const files = await database.collection("evidence").find({ ownerId: { $in: owners } }).toArray();
    for (const file of files) if (/^[a-f0-9-]{36}$/.test(String(file._id))) await unlink(join(process.cwd(), ".local", "evidence", config.mongoDatabase, `${file._id}.blob`)).catch(() => undefined);
    for (const collection of ["reports", "report_revisions", "graph_outbox", "evidence"]) await database.collection(collection).deleteMany({ ownerId: { $in: owners } });
    const ids = owners.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    for (const collection of ["session", "account"]) await database.collection(collection).deleteMany({ userId: { $in: [...owners, ...ids] } });
    await database.collection("user").deleteMany({ _id: { $in: ids } });
    const graph = await FalkorDB.connect({ socket: { host: config.graphHost, port: config.graphPort }, password: config.graphPassword });
    try {
      const names = new Set(await graph.list());
      for (const owner of owners) { const name = privateGraphName(config.mongoDatabase, owner); if (names.has(name)) await graph.selectGraph(name).delete(); }
    } finally { await graph.close(); }
  } finally { await mongo.close(); }
});

describe("real HTTP ownership and input boundaries", () => {
  it("requires authentication and returns private no-store responses", async () => {
    const result = await call("/api/reports", "");
    expect(result.status).toBe(401); expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
  it("creates and replays a report with an authenticated session", async () => {
    const key = randomUUID(); const payload = { synthetic: true, language: "hinglish", narrative: "Fictional example: maine phone order kiya, delivery nahi hui." };
    const result = await call("/api/reports", cookieA, "POST", payload, { "Idempotency-Key": key });
    expect(result.status).toBe(201);
    const body = await result.json(); reportId = body.report._id;
    expect(body.report.ownerId).toBeUndefined(); expect(body.report.creationKey).toBeUndefined();
    const replay = await call("/api/reports", cookieA, "POST", payload, { "Idempotency-Key": key });
    expect((await replay.json()).report._id).toBe(reportId);
  });
  it("rejects cross-account reads and writes with the same not-found response", async () => {
    expect((await call(`/api/reports/${reportId}`, cookieB)).status).toBe(404);
    expect((await call(`/api/reports/${reportId}`, cookieB, "PATCH", { operation: "add_message", expectedRevision: 1, text: "Wrong owner" })).status).toBe(404);
    expect((await call(`/api/reports/${reportId}/confirm`, cookieB, "POST", { expectedRevision: 1, acknowledged: true })).status).toBe(404);
    expect((await call(`/api/reports/${reportId}/connections`, cookieB)).status).toBe(404);
    expect((await (await call("/api/reports", cookieB)).json()).reports).toEqual([]);
  });
  it("rejects forged owners, Mongo operators, malformed IDs and oversized bodies", async () => {
    const extra = { "Idempotency-Key": randomUUID() };
    expect((await call("/api/reports", cookieA, "POST", { synthetic: true, language: "en", narrative: "Example", ownerId: owners[1] }, extra)).status).toBe(400);
    expect((await call("/api/reports", cookieA, "POST", { synthetic: true, language: "en", narrative: { $ne: null } }, extra)).status).toBe(400);
    expect((await call("/api/reports/not-a-uuid", cookieA)).status).toBe(400);
    expect((await call("/api/reports", cookieA, "POST", { synthetic: true, language: "en", narrative: "x".repeat(140_000) }, extra)).status).toBe(413);
  });
  it("rejects absent or foreign origins and non-JSON mutations", async () => {
    const payload = { expectedRevision: 1, acknowledged: true };
    expect((await call(`/api/reports/${reportId}/confirm`, cookieA, "POST", payload, { Origin: "https://example.com" })).status).toBe(403);
    const absent = await fetch(`${config.origin}/api/reports/${reportId}/confirm`, { method: "POST", headers: { Cookie: cookieA, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    expect(absent.status).toBe(403);
    expect((await call(`/api/reports/${reportId}/confirm`, cookieA, "POST", payload, { "Content-Type": "text/plain" })).status).toBe(415);
  });
  it("requires revision acknowledgement before graph access", async () => {
    expect((await call(`/api/reports/${reportId}/connections`, cookieA)).status).toBe(409);
    expect((await call(`/api/reports/${reportId}/confirm`, cookieA, "POST", { expectedRevision: 2, acknowledged: true })).status).toBe(409);
    expect((await call(`/api/reports/${reportId}/confirm`, cookieA, "POST", { expectedRevision: 1, acknowledged: true })).status).toBe(200);
    const result = await call(`/api/reports/${reportId}/connections`, cookieA);
    expect(result.status).toBe(202); expect((await result.json()).status).toBe("pending");
  });
  it("invalidates confirmation after a correction", async () => {
    const current = await (await call(`/api/reports/${reportId}`, cookieA)).json();
    const result = await call(`/api/reports/${reportId}`, cookieA, "PATCH", { operation: "correct_assertion", expectedRevision: 1, assertionId: current.report.assertions[0].id, value: "Fictional correction: it arrived late." });
    expect(result.status).toBe(200);
    const corrected = await result.json();
    expect(corrected.report.revision).toBe(2); expect(corrected.report.confirmation).toBeNull();
    expect(corrected.report.assertions[0].originalValue).toBe(current.report.messages[0].text);
    expect((await call(`/api/reports/${reportId}/connections`, cookieA)).status).toBe(409);
  });
  it("uploads, restores and reads owned plain-text evidence with no storage path in responses", async () => {
    const key = randomUUID(), words = "  काल्पनिक रिकॉर्ड।\nPayment ka note.  ";
    const uploaded = await uploadFile(words, key); expect(uploaded.status).toBe(201);
    const body = await uploaded.json(); fileId = body.evidence.id; fileHash = body.evidence.sha256;
    expect(body.evidence).toMatchObject({ reportId, status: "stored", reviewed: false });
    expect(body.evidence.ownerId).toBeUndefined(); expect(body.evidence.text).toBeUndefined(); expect(body.evidence.path).toBeUndefined();
    const replay = await uploadFile(words, key); expect((await replay.json()).evidence.id).toBe(fileId);
    const parsed = await call(`/api/reports/${reportId}/evidence/${fileId}/extract`, cookieA, "POST");
    expect((await parsed.json()).evidence.status).toBe("ready");
    const read = await call(`/api/reports/${reportId}/evidence/${fileId}/source`, cookieA);
    expect(read.headers.get("cache-control")).toBe("private, no-store"); expect((await read.json()).source.text).toBe(words);
    expect((await (await call(`/api/reports/${reportId}/evidence`, cookieA)).json()).evidence).toHaveLength(1);
  });
  it("enforces upload boundaries and file ownership for every operation", async () => {
    expect((await uploadFile("x".repeat(65537))).status).toBe(413);
    expect((await uploadFile("%PDF-1.7")).status).toBe(415);
    expect((await uploadFile("Fictional", randomUUID(), { "X-File-Name": "..%2Frecord.txt" })).status).toBe(400);
    expect((await uploadFile("Fictional", randomUUID(), { Origin: "https://example.com" })).status).toBe(403);
    expect((await uploadFile("Fictional", randomUUID(), { Cookie: "" })).status).toBe(401);
    for (const [suffix, method] of [["", "GET"], ["", "DELETE"], ["/extract", "POST"], ["/cancel", "POST"], ["/source", "GET"], ["/review", "POST"]]) {
      expect((await call(`/api/reports/${reportId}/evidence/${fileId}${suffix}`, cookieB, method, method === "POST" && suffix === "/review" ? { expectedRevision: 2, acknowledged: true, sha256: fileHash } : undefined)).status).toBe(404);
    }
    expect((await call(`/api/reports/${reportId}/evidence`, cookieB)).status).toBe(404);
  });
  it("queues and cancels an owned PDF through HTTP", async () => {
    const bytes = new Uint8Array(await readFile("tests/fixtures/evidence/text-record.pdf"));
    const uploaded = await uploadFile(bytes, randomUUID(), { "Content-Type": "application/pdf", "X-File-Name": "record.pdf" });
    expect(uploaded.status).toBe(201); const file = (await uploaded.json()).evidence;
    const endpoint = `/api/reports/${reportId}/evidence/${file.id}`;
    expect((await (await call(`${endpoint}/extract`, cookieA, "POST")).json()).evidence.status).toBe("queued");
    expect((await call(`${endpoint}/source`, cookieA)).status).toBe(409);
    expect((await (await call(`${endpoint}/cancel`, cookieA, "POST")).json()).evidence.status).toBe("canceled");
    expect((await call(`${endpoint}/cancel`, cookieB, "POST")).status).toBe(404);
  });
  it("requires reviewed text acknowledgement and imports the source only once", async () => {
    const endpoint = `/api/reports/${reportId}/evidence/${fileId}/review`, approval = { expectedRevision: 2, acknowledged: true, sha256: fileHash };
    expect((await call(endpoint, cookieA, "POST", { ...approval, acknowledged: false })).status).toBe(400);
    expect((await call(endpoint, cookieA, "POST", { ...approval, expectedRevision: 1 })).status).toBe(409);
    const imported = await call(endpoint, cookieA, "POST", approval); expect(imported.status).toBe(200);
    const report = (await imported.json()).report;
    expect(report.revision).toBe(3); expect(report.confirmation).toBeNull(); expect(report.evidenceCount).toBeUndefined();
    expect(report.messages.at(-1).evidenceSource).toMatchObject({ evidenceId: fileId, sha256: fileHash });
    expect((await (await call(endpoint, cookieA, "POST", approval)).json()).report.messages).toHaveLength(2);
    expect((await call(`/api/reports/${reportId}/evidence/${fileId}`, cookieA, "DELETE")).status).toBe(200);
    expect((await call(`/api/reports/${reportId}/evidence/${fileId}/source`, cookieA)).status).toBe(404);
    expect((await (await call(`/api/reports/${reportId}`, cookieA)).json()).report.messages.at(-1).evidenceSource.evidenceId).toBe(fileId);
  });
  it("processes a real image and requires approval of the displayed text receipt", async () => {
    const uploaded = await uploadFile(new Uint8Array(await readFile("tests/fixtures/evidence/record.png")), randomUUID(), { "Content-Type": "image/png", "X-File-Name": "record.png" });
    expect(uploaded.status).toBe(201); const file = (await uploaded.json()).evidence;
    const endpoint = `/api/reports/${reportId}/evidence/${file.id}`;
    expect((await (await call(`${endpoint}/extract`, cookieA, "POST")).json()).evidence.status).toBe("queued");
    const mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin" });
    try {
      await new EvidenceWorker(mongo.db(config.mongoDatabase), new EvidenceFiles(join(process.cwd(), ".local/evidence", config.mongoDatabase))).runOnce();
      const response = await call(`${endpoint}/source`, cookieA); expect(response.status).toBe(200);
      const source = (await response.json()).source; expect(source.text).toContain("laptop"); expect(source.extraction.pages[0].method).toBe("ocr");
      const current = (await (await call(`/api/reports/${reportId}`, cookieA)).json()).report;
      const approval = { expectedRevision: current.revision, acknowledged: true, sha256: file.sha256 };
      expect((await call(`${endpoint}/review`, cookieA, "POST", approval)).status).toBe(409);
      expect((await call(`${endpoint}/review`, cookieA, "POST", { ...approval, textSha256: source.extraction.textSha256 })).status).toBe(200);
    } finally { await mongo.close(); }
  }, 65_000);
  it("revokes the session on sign-out, even if an old cookie is replayed", async () => {
    expect((await call("/api/auth/sign-out", cookieA, "POST", {})).status).toBe(200);
    expect((await call(`/api/reports/${reportId}`, cookieA)).status).toBe(401);
  });
});
