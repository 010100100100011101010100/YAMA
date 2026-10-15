import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MongoClient, ObjectId } from "mongodb";
import { FalkorDB } from "falkordb";
import { getServerConfig } from "@/server/config";
import { AgentWorker } from "@/server/agents/worker";
import { GraphWorker } from "@/server/jobs/graph-worker";
import { GraphStore, privateGraphName } from "@/server/database/graph";
import { connectGraph } from "@/server/database/graph-client";
import type { AgentTask } from "@/lib/agent-task";
import type { SavedReport } from "@/lib/report-api";
import { anonymousSignIn } from "./anonymous-session";

process.loadEnvFile(".env.local");
const config = getServerConfig(), owners: string[] = [];
const mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", {
  auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin" });
let cookieA: string, cookieB: string, report: SavedReport, task: AgentTask;
const path = () => `/api/reports/${report._id}/agent-tasks`;
const approval = () => ({ expectedRevision: task.revision, acknowledged: true, resultHash: task.resultHash,
  proposalIds: task.result!.proposals.filter(proposal => ["amount", "item", "pattern"].includes(proposal.field)).map(proposal => proposal.id) });
async function call(route: string, cookie = cookieA, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${config.origin}${route}`, { method, headers: { Cookie: cookie, Origin: config.origin,
    "Content-Type": "application/json", "Idempotency-Key": randomUUID(), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn() {
  const response = await anonymousSignIn(config.origin);
  if (!response.ok) throw new Error(`Anonymous fixture session failed: HTTP ${response.status}`);
  owners.push((await response.json()).user.id);
  return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
}
beforeAll(async () => {
  if (!(await fetch(`${config.origin}/api/health`)).ok) throw new Error("Start initialized databases and dev server before HTTP tests");
  cookieA = await signIn(); cookieB = await signIn();
  const fixture = JSON.parse(await readFile("agents/fixtures/incidents.json", "utf8"))[1];
  const created = await call("/api/reports", cookieA, "POST", { synthetic: true, language: fixture.language, narrative: fixture.narrative });
  expect(created.status).toBe(201); report = (await created.json()).report;
});
afterAll(async () => {
  try {
    const database = mongo.db(config.mongoDatabase);
    for (const collection of ["agent_tasks", "reports", "report_revisions", "graph_outbox"]) await database.collection(collection).deleteMany({ ownerId: { $in: owners } });
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

describe("authenticated durable agent HTTP flow", () => {
  it("queues and replays a private receipt without altering a confirmed report", async () => {
    expect((await call(`/api/reports/${report._id}/confirm`, cookieA, "POST", { expectedRevision: 1, acknowledged: true })).status).toBe(200);
    const key = randomUUID(), headers = { "Idempotency-Key": key };
    const response = await call(path(), cookieA, "POST", { expectedRevision: 1 }, headers);
    expect(response.status).toBe(202); expect(response.headers.get("cache-control")).toBe("private, no-store");
    task = (await response.json()).task;
    expect(task).toMatchObject({ status: "queued", revision: 1, adapter: { live: false, provider: "fixture" } });
    for (const field of ["ownerId", "requestKey", "claimToken", "leaseUntil"]) expect(task).not.toHaveProperty(field);
    expect((await (await call(path(), cookieA, "POST", { expectedRevision: 1 }, headers)).json()).task.id).toBe(task.id);
    const restored = (await (await call(`/api/reports/${report._id}`)).json()).report;
    expect(restored.confirmation.revision).toBe(1); expect(restored.assertions).toHaveLength(1);
    expect(restored.agentTaskCount).toBeUndefined(); expect(restored.agentTaskFence).toBeUndefined();
  });
  it("rejects foreign accounts, forged roles and origins on every receipt operation", async () => {
    for (const [suffix, method, body] of [["", "GET", undefined], ["", "POST", { expectedRevision: 1 }],
      [`/${task.id}`, "GET", undefined], [`/${task.id}/cancel`, "POST", undefined], [`/${task.id}/accept`, "POST", {}]] as const) {
      expect((await call(`${path()}${suffix}`, cookieB, method, body)).status).toBe(404);
      expect((await call(`${path()}${suffix}`, "", method, body)).status).toBe(401);
    }
    expect((await call(path(), cookieA, "POST", { expectedRevision: 1, agent: "disha" })).status).toBe(400);
    expect((await call(path(), cookieA, "POST", { expectedRevision: 1 }, { Origin: "https://example.com" })).status).toBe(403);
    expect((await call(`${path()}/not-a-uuid`)).status).toBe(400);
    expect((await call(`${path()}/${task.id}/accept`, cookieA, "POST", {}, { "Content-Type": "text/plain" })).status).toBe(415);
  });
  it("runs Python, reviews stored IDs and accepts a subset atomically without confirming it", async () => {
    expect(task.adapter.provider).toBe("fixture");
    expect(await new AgentWorker(mongo.db(config.mongoDatabase), mongo).runOnce()).toBe(true);
    task = (await (await call(`${path()}/${task.id}`)).json()).task;
    expect(task.status).toBe("ready"); expect(task.result!.proposals).toHaveLength(6);
    for (const proposal of task.result!.proposals) expect(report.messages[0].text.slice(proposal.source.start, proposal.source.end)).toBe(proposal.quote);
    const endpoint = `${path()}/${task.id}/accept`, input = approval();
    expect((await call(endpoint, cookieA, "POST", { ...input, acknowledged: false })).status).toBe(400);
    expect((await call(endpoint, cookieA, "POST", { ...input, proposalIds: [randomUUID()] })).status).toBe(400);
    expect((await call(endpoint, cookieA, "POST", { ...input, resultHash: "a".repeat(64) })).status).toBe(409);
    const response = await call(endpoint, cookieA, "POST", input); expect(response.status).toBe(200);
    const accepted = await response.json(); report = accepted.report;
    expect(report.revision).toBe(2); expect(report.confirmation).toBeNull();
    expect(report.assertions).toHaveLength(1 + input.proposalIds.length);
    expect(report.assertions.slice(1).every(assertion => assertion.origin === "agent_proposal" && assertion.verification === "not_verified" && assertion.agentSource?.taskId === task.id)).toBe(true);
    expect(accepted.task.accepted.proposalIds).toEqual([...input.proposalIds].sort());
    expect((await (await call(endpoint, cookieA, "POST", input)).json()).report.revision).toBe(2);
    expect((await call(endpoint, cookieA, "POST", { ...input, proposalIds: [input.proposalIds[0]] })).status).toBe(409);
    expect((await call(`/api/reports/${report._id}/connections`)).status).toBe(409);
    expect(await mongo.db(config.mongoDatabase).collection("report_revisions").countDocuments({ reportId: report._id, revision: 2 })).toBe(1);
    expect(await mongo.db(config.mongoDatabase).collection("graph_outbox").countDocuments({ reportId: report._id, revision: 2 })).toBe(0);
  });
  it("requires fresh confirmation and queries the actual private graph", async () => {
    expect((await call(`/api/reports/${report._id}/confirm`, cookieA, "POST", { expectedRevision: 2, acknowledged: true })).status).toBe(200);
    const graph = await connectGraph(config.graphHost, config.graphPort, config.graphPassword);
    try {
      const database = mongo.db(config.mongoDatabase), worker = new GraphWorker(database, new GraphStore(graph, config.mongoDatabase));
      // The earlier confirmed revision is superseded before this revision is projected.
      for (let attempt = 0; attempt < 10; attempt++) {
        await worker.runOnce();
        if (await database.collection("graph_outbox").findOne({ reportId: report._id, revision: 2, status: "done" })) break;
      }
      expect(await database.collection("graph_outbox").findOne({ reportId: report._id, revision: 2, status: "done" })).not.toBeNull();
    }
    finally { await graph.close(); }
    const response = await call(`/api/reports/${report._id}/connections`); expect(response.status).toBe(200);
    expect((await response.json()).candidates).toHaveLength(2);
    expect((await call(`/api/reports/${report._id}/connections`, cookieB)).status).toBe(404);
  });
  it("restores cancellation, rejects stale results and revokes receipt access after sign-out", async () => {
    const queued = (await (await call(path(), cookieA, "POST", { expectedRevision: 2 })).json()).task as AgentTask;
    expect((await (await call(`${path()}/${queued.id}/cancel`, cookieA, "POST")).json()).task.status).toBe("canceled");
    const next = (await (await call(path(), cookieA, "POST", { expectedRevision: 2 })).json()).task as AgentTask;
    const changed = await call(`/api/reports/${report._id}`, cookieA, "PATCH", { operation: "add_message", expectedRevision: 2, text: "Fictional correction." });
    expect(changed.status).toBe(200);
    const history = (await (await call(path())).json()).tasks as AgentTask[];
    expect(history.find(receipt => receipt.id === queued.id)?.status).toBe("canceled");
    expect(history.find(receipt => receipt.id === next.id)?.status).toBe("stale");
    expect(history.find(receipt => receipt.id === task.id)?.status).toBe("accepted");
    expect((await call("/api/auth/sign-out", cookieA, "POST", {})).status).toBe(200);
    expect((await call(path())).status).toBe(401);
  });
});
