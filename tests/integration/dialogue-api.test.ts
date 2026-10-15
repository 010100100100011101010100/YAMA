import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { getServerConfig } from "@/server/config";
import { DialogueWorker } from "@/server/dialogue/worker";
import type { Dialogue } from "@/lib/dialogue";
import type { SavedReport } from "@/lib/report-api";
import { anonymousSignIn } from "./anonymous-session";

process.loadEnvFile(".env.local");
const config = getServerConfig(), owners: string[] = [];
const mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin" });
let cookieA: string, cookieB: string, report: SavedReport, state: Dialogue;
const path = () => `/api/reports/${report._id}/dialogue`;
async function call(route: string, cookie = cookieA, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${config.origin}${route}`, { method, headers: { Cookie: cookie, Origin: config.origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID(), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn() {
  const response = await anonymousSignIn(config.origin); expect(response.status).toBe(200);
  owners.push((await response.json()).user.id);
  return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
}
beforeAll(async () => {
  cookieA = await signIn(); cookieB = await signIn();
  const created = await call("/api/reports", cookieA, "POST", { synthetic: true, language: "en", narrative: "Synthetic: I did not send money." });
  expect(created.status).toBe(201); report = (await created.json()).report;
});
afterAll(async () => {
  try {
    const database = mongo.db(config.mongoDatabase);
    for (const collection of ["dialogues", "reports", "report_revisions"]) await database.collection(collection).deleteMany({ ownerId: { $in: owners } });
    const ids = owners.filter(ObjectId.isValid).map(id => new ObjectId(id));
    for (const collection of ["session", "account"]) await database.collection(collection).deleteMany({ userId: { $in: [...owners, ...ids] } });
    await database.collection("user").deleteMany({ _id: { $in: ids } });
  } finally { await mongo.close(); }
});
const operation = (extra: object) => ({ expectedRevision: report.revision, expectedVersion: state.version, ...extra });
describe("session-bound text dialogue HTTP", () => {
  it("initializes a private conversation and freezes the queued role and adapter", async () => {
    const loaded = await call(path()); expect(loaded.status).toBe(200); expect(loaded.headers.get("cache-control")).toBe("private, no-store");
    state = (await loaded.json()).dialogue;
    const queued = await call(path(), cookieA, "POST", operation({ operation: "reply", key: randomUUID(), messageId: report.messages[0].id, agent: "disha", automatic: false, language: "hi" }));
    expect(queued.status).toBe(200); state = (await queued.json()).dialogue;
    expect(state.turn).toMatchObject({ status: "queued", agent: "disha", adapter: { provider: "fixture", live: false } });
    expect(state).not.toHaveProperty("ownerId"); expect(state.turn).not.toHaveProperty("executionConfigHash");
    expect(state.turn).not.toHaveProperty("claimToken");
  });
  it("rejects foreign sessions, origins, role paths and model-supplied writes", async () => {
    for (const [method, body] of [["GET", undefined], ["POST", operation({ operation: "stop" })]] as const) {
      expect((await call(path(), cookieB, method, body)).status).toBe(404);
      expect((await call(path(), "", method, body)).status).toBe(401);
    }
    expect((await call(path(), cookieA, "POST", operation({ operation: "select", agent: "../../staff" }))).status).toBe(400);
    expect((await call(path(), cookieA, "POST", operation({ operation: "stop", confirmed: true }))).status).toBe(400);
    expect((await call(path(), cookieA, "POST", operation({ operation: "stop" }), { Origin: "https://example.com" })).status).toBe(403);
  });
  it("runs the private runtime, acknowledges rendered text and restores its history", async () => {
    expect(state.turn?.adapter.provider).toBe("fixture");
    await new DialogueWorker(mongo.db(config.mongoDatabase), mongo).runOnce();
    state = (await (await call(path())).json()).dialogue;
    expect(state.turn?.status).toBe("ready"); expect(state.turn?.reply?.text).toContain("दिशा");
    const body = operation({ operation: "delivered", turnId: state.turn!.id });
    const delivered = await call(path(), cookieA, "POST", body); expect(delivered.status).toBe(200);
    state = (await delivered.json()).dialogue;
    expect(state.turn?.status).toBe("delivered"); expect(state.messages).toHaveLength(1);
    expect((await (await call(path(), cookieA, "POST", body)).json()).dialogue.messages).toHaveLength(1);
    const unchanged = (await (await call(`/api/reports/${report._id}`)).json()).report;
    expect(unchanged.assertions).toEqual(report.assertions); expect(unchanged.confirmation).toBeNull();
  });
  it("revokes conversation access after sign-out", async () => {
    expect((await call("/api/auth/sign-out", cookieA, "POST", {})).status).toBe(200);
    expect((await call(path())).status).toBe(401);
  });
});
