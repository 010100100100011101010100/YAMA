import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initializeSchema } from "@/server/database/schema";
import { ReportRepository } from "@/server/reports/repository";
import { AgentTaskService, type AgentTaskRecord } from "@/server/agents/service";
import { AgentWorker } from "@/server/agents/worker";
import { runFixtureSnapshot } from "@/server/agents/runtime";
import { reserveProviderCall } from "@/server/agents/budget";
import type { Report } from "@/server/reports/domain";

process.loadEnvFile(".env.local");
const namespace = `yama_agent_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin" });
let database: Db, reports: ReportRepository, tasks: AgentTaskService, report: Report;
function fakeExtraction(snapshot: Report) {
  const source = snapshot.messages[0]; const start = source.text.indexOf("₹18,000");
  return { proposals: [{ field: "amount", value: "₹18,000", polarity: "affirmed", quote: "₹18,000",
    source: { messageId: source.id, start, end: start + 7 } }], skippedExisting: 0 };
}
const enqueue = (key = randomUUID(), owner = "owner-a") => tasks.enqueue(owner, report._id, { expectedRevision: report.revision }, key);
async function ready() {
  const task = await enqueue();
  await new AgentWorker(database, mongo, async snapshot => fakeExtraction(snapshot)).runOnce();
  return tasks.get("owner-a", report._id, task.id);
}
function approval(task: Awaited<ReturnType<typeof ready>>) {
  return { expectedRevision: task.revision, acknowledged: true, resultHash: task.resultHash!, proposalIds: task.result!.proposals.map(proposal => proposal.id) };
}
beforeAll(async () => { database = mongo.db(namespace); await initializeSchema(database); reports = new ReportRepository(database, mongo); tasks = new AgentTaskService(database, mongo); });
beforeEach(async () => {
  await database.collection("agent_tasks").deleteMany({});
  await database.collection("provider_budgets").deleteMany({});
  await database.collection<{ _id: string }>("agent_worker_lock").updateOne({ _id: "agent" }, { $set: { claimToken: null, leaseUntil: new Date(0) } });
  report = await reports.create("owner-a", { synthetic: true, language: "en", narrative: "Fictional: 📝 I paid ₹18,000." }, randomUUID());
});
afterAll(async () => { await mongo.db(namespace).dropDatabase(); await mongo.close(); });
afterEach(() => vi.unstubAllEnvs());

describe("bounded OpenAI jobs using a fake runner", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries({ YAMA_TEXT_PROVIDER: "openai", YAMA_MODEL_LIVE_ENABLED: "true", YAMA_DEMO_ONLY: "true",
      YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED: "true", OPENAI_API_KEY: "test-key-never-sent", OPENAI_TEXT_MODEL: "test-model", YAMA_OPENAI_MAX_CALLS: "2" })) vi.stubEnv(key, value);
  });
  it("atomically reserves at most the remaining budget under concurrent requests", async () => {
    const reservations = await Promise.allSettled(Array.from({ length: 8 }, () => reserveProviderCall(database, 2)));
    expect(reservations.filter(reservation => reservation.status === "fulfilled")).toHaveLength(2);
    expect(await database.collection("provider_budgets").findOne({})).toMatchObject({ reservedCalls: 2 });
  });
  it("freezes actual provider identity, reserves a shared call and preserves accepted provenance", async () => {
    const task = await enqueue(), runner = vi.fn(async (snapshot: Report) => fakeExtraction(snapshot));
    expect(task.adapter).toMatchObject({ provider: "openai", model: "test-model", live: true });
    await new AgentWorker(database, mongo, runner).runOnce();
    const receipt = await tasks.get("owner-a", report._id, task.id);
    expect(receipt.status).toBe("ready");
    expect(runner.mock.calls[0][0]._id).toBe(report._id);
    expect(await database.collection("provider_budgets").findOne({})).toMatchObject({ reservedCalls: 1 });
    const accepted = await tasks.accept("owner-a", report._id, task.id, approval(receipt));
    expect(accepted.report.assertions.at(-1)?.agentSource).toMatchObject({ provider: "openai", model: "test-model" });
    expect(accepted.report.confirmation).toBeNull();
    expect(receipt).not.toHaveProperty("executionConfigHash");
    const stored = await database.collection<AgentTaskRecord>("agent_tasks").findOne({ _id: task.id });
    expect(JSON.stringify(stored)).not.toContain("test-key-never-sent");
  });
  it("blocks a changed model/destination/config before making a call", async () => {
    const task = await enqueue(), runner = vi.fn(async (snapshot: Report) => fakeExtraction(snapshot));
    vi.stubEnv("OPENAI_BASE_URL", "https://in.api.openai.com/v1");
    await new AgentWorker(database, mongo, runner).runOnce();
    expect(runner).not.toHaveBeenCalled();
    expect((await tasks.get("owner-a", report._id, task.id)).errorCode).toBe("provider_config_changed");
    expect(await database.collection("provider_budgets").countDocuments()).toBe(0);
  });
  it("never replays an expired live claim whose provider outcome is uncertain", async () => {
    const task = await enqueue(), runner = vi.fn(async (snapshot: Report) => fakeExtraction(snapshot));
    await database.collection<AgentTaskRecord>("agent_tasks").updateOne({ _id: task.id }, { $set: { status: "running", attempts: 1, leaseUntil: new Date(0), claimToken: randomUUID() } });
    await new AgentWorker(database, mongo, runner).runOnce();
    expect(runner).not.toHaveBeenCalled();
    expect((await tasks.get("owner-a", report._id, task.id)).errorCode).toBe("provider_call_uncertain");
  });
  it("enforces one budget across reports and retains reservations after failure", async () => {
    vi.stubEnv("YAMA_OPENAI_MAX_CALLS", "1");
    await enqueue();
    const runner = vi.fn(async () => { throw new Error("PRIVATE_UPSTREAM_BODY"); });
    const worker = new AgentWorker(database, mongo, runner);
    await worker.runOnce();
    report = await reports.create("owner-a", { synthetic: true, language: "en", narrative: "Second fictional report: ₹18,000." }, randomUUID());
    const second = await enqueue(); await worker.runOnce();
    expect(runner).toHaveBeenCalledOnce();
    expect((await tasks.get("owner-a", report._id, second.id)).errorCode).toBe("provider_budget_exhausted");
    expect(await database.collection("provider_budgets").findOne({})).toMatchObject({ reservedCalls: 1 });
  });
  it("rejects adapter tampering even when the proposals and hash were previously valid", async () => {
    const task = await ready();
    await database.collection<AgentTaskRecord>("agent_tasks").updateOne({ _id: task.id }, { $set: { "adapter.model": "tampered-model" } });
    await expect(tasks.get("owner-a", report._id, task.id)).rejects.toThrow("invalid_task_result");
  });
  it("still executes old fixture jobs after switching the configured provider", async () => {
    vi.stubEnv("YAMA_TEXT_PROVIDER", "fixture");
    const task = await enqueue(); vi.stubEnv("YAMA_TEXT_PROVIDER", "openai");
    await new AgentWorker(database, mongo, async snapshot => fakeExtraction(snapshot)).runOnce();
    expect((await tasks.get("owner-a", report._id, task.id)).adapter.provider).toBe("fixture");
    expect(await database.collection("provider_budgets").countDocuments()).toBe(0);
  });
});

describe("durable agent tasks and explicit acceptance", () => {
  it("persists queued status across service reconstruction and idempotent retries", async () => {
    const key = randomUUID(); const first = await enqueue(key);
    expect(first).toMatchObject({ status: "queued", revision: 1, agent: "saathi" });
    const reconstructed = new AgentTaskService(database, mongo);
    expect((await reconstructed.enqueue("owner-a", report._id, { expectedRevision: 1 }, key)).id).toBe(first.id);
    expect(await database.collection("agent_tasks").countDocuments()).toBe(1);
    expect((await reports.get("owner-a", report._id)).revision).toBe(1);
    await expect(reconstructed.enqueue("owner-a", report._id, { expectedRevision: 2 }, key)).rejects.toThrow("idempotency_conflict");
  });
  it("rejects foreign owners, forged roles, stale enqueue and unknown tasks", async () => {
    const task = await enqueue();
    await expect(enqueue(randomUUID(), "owner-b")).rejects.toThrow("report_not_found");
    for (const operation of [() => tasks.get("owner-b", report._id, task.id), () => tasks.cancel("owner-b", report._id, task.id), () => tasks.accept("owner-b", report._id, task.id, {})]) await expect(operation()).rejects.toThrow("report_not_found");
    await expect(tasks.enqueue("owner-a", report._id, { expectedRevision: 1, agent: "drishti" }, randomUUID())).rejects.toThrow("invalid_request");
    await expect(tasks.enqueue("owner-a", report._id, { expectedRevision: 2 }, randomUUID())).rejects.toThrow("revision_conflict");
    await expect(tasks.get("owner-a", report._id, randomUUID())).rejects.toThrow("task_not_found");
  });
  it("produces a ready hashed preview without changing confirmation or report content", async () => {
    await reports.confirm("owner-a", report._id, { expectedRevision: 1, acknowledged: true });
    const task = await ready();
    expect(task.status).toBe("ready"); expect(task.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(task.result?.proposals[0].quote).toBe("₹18,000");
    const current = await reports.get("owner-a", report._id);
    expect(current.revision).toBe(1); expect(current.confirmation?.revision).toBe(1); expect(current.assertions).toHaveLength(1);
    expect(task).not.toHaveProperty("ownerId"); expect(task).not.toHaveProperty("claimToken");
  });
  it("accepts once, keeps immutable provenance and preserves a later user correction on replay", async () => {
    const task = await ready(); const accepted = await tasks.accept("owner-a", report._id, task.id, approval(task));
    expect(accepted.report.revision).toBe(2); expect(accepted.report.confirmation).toBeNull();
    expect(accepted.report.assertions.at(-1)).toMatchObject({ origin: "agent_proposal", verification: "not_verified", agentSource: { taskId: task.id } });
    const assertion = accepted.report.assertions.at(-1)!;
    await reports.revise("owner-a", report._id, { operation: "correct_assertion", expectedRevision: 2, assertionId: assertion.id, value: "₹12,000", included: false });
    const replay = await tasks.accept("owner-a", report._id, task.id, approval(task));
    expect(replay.report.revision).toBe(3); expect(replay.report.assertions.at(-1)?.value).toBe("₹12,000");
    expect(replay.report.assertions).toHaveLength(2);
    expect(await database.collection("report_revisions").countDocuments({ reportId: report._id, revision: 2 })).toBe(1);
  });
  it("rejects hash, acknowledgement, unknown selection and duplicate selection forgery", async () => {
    const task = await ready(); const input = approval(task);
    for (const forged of [{ ...input, acknowledged: false }, { ...input, resultHash: "a".repeat(64) },
      { ...input, proposalIds: [randomUUID()] }, { ...input, proposalIds: [] }, { ...input, proposalIds: [input.proposalIds[0], input.proposalIds[0]] }, { ...input, proposals: [] }]) {
      await expect(tasks.accept("owner-a", report._id, task.id, forged)).rejects.toThrow();
    }
    expect((await reports.get("owner-a", report._id)).revision).toBe(1);
  });
  it("makes ready proposals stale after an edit and refuses acceptance", async () => {
    const task = await ready();
    await reports.revise("owner-a", report._id, { operation: "add_message", expectedRevision: 1, text: "Fictional correction." });
    expect((await tasks.get("owner-a", report._id, task.id)).status).toBe("stale");
    await expect(tasks.accept("owner-a", report._id, task.id, approval(task))).rejects.toThrow("revision_conflict");
  });
  it("discards an edited or canceled result while the runner is working", async () => {
    for (const operation of ["edit", "cancel"]) {
      const task = await enqueue();
      let started!: () => void, release!: () => void;
      const entered = new Promise<void>(resolve => { started = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      const execution = new AgentWorker(database, mongo, async snapshot => { started(); await gate; return fakeExtraction(snapshot); }).runOnce();
      await entered;
      if (operation === "edit") { report = await reports.revise("owner-a", report._id, { operation: "add_message", expectedRevision: report.revision, text: "Edit during task." }); }
      else await tasks.cancel("owner-a", report._id, task.id);
      release(); await execution;
      const receipt = await tasks.get("owner-a", report._id, task.id);
      expect(receipt.status).toBe(operation === "edit" ? "stale" : "canceled"); expect(receipt.result).toBeNull();
    }
  });
  it("recovers an expired claim and bounds crash attempts", async () => {
    const task = await enqueue();
    await database.collection<AgentTaskRecord>("agent_tasks").updateOne({ _id: task.id }, { $set: { status: "running", claimToken: randomUUID(), leaseUntil: new Date(0), attempts: 2 } });
    await new AgentWorker(database, mongo, async snapshot => fakeExtraction(snapshot)).runOnce();
    expect((await tasks.get("owner-a", report._id, task.id)).attempts).toBe(3);
    const exhausted = await enqueue();
    await database.collection<AgentTaskRecord>("agent_tasks").updateOne({ _id: exhausted.id }, { $set: { status: "running", claimToken: randomUUID(), leaseUntil: new Date(0), attempts: 3 } });
    await new AgentWorker(database, mongo, async snapshot => fakeExtraction(snapshot)).runOnce();
    expect((await tasks.get("owner-a", report._id, exhausted.id))).toMatchObject({ status: "failed", errorCode: "retry_limit" });
  });
  it("a replaced claim cannot commit a late result", async () => {
    const task = await enqueue();
    await new AgentWorker(database, mongo, async snapshot => {
      await database.collection<AgentTaskRecord>("agent_tasks").updateOne({ _id: task.id }, { $set: { claimToken: randomUUID() } });
      return fakeExtraction(snapshot);
    }).runOnce();
    expect((await tasks.get("owner-a", report._id, task.id)).status).toBe("running");
  });
  it("sanitizes invalid output/provider failures and keeps drafts intact", async () => {
    for (const runner of [async () => ({ proposals: [{ ownerId: "forged" }], skippedExisting: 0 }), async () => { throw new Error("private incident payload"); }]) {
      const task = await enqueue(); await new AgentWorker(database, mongo, runner).runOnce();
      const receipt = await tasks.get("owner-a", report._id, task.id);
      expect(receipt.status).toBe("failed"); expect(JSON.stringify(receipt)).not.toContain("private incident");
    }
    expect((await reports.get("owner-a", report._id)).revision).toBe(1);
  });
  it("rolls back the draft and snapshot if acceptance receipt update fails", async () => {
    const task = await ready();
    await database.command({ collMod: "agent_tasks", validator: { status: { $ne: "accepted" } } });
    try {
      await expect(tasks.accept("owner-a", report._id, task.id, approval(task))).rejects.toThrow();
      expect((await reports.get("owner-a", report._id)).revision).toBe(1);
      expect(await database.collection("report_revisions").countDocuments({ reportId: report._id })).toBe(1);
    } finally { await initializeSchema(database); }
  });
  it("caps concurrent task creation without consuming quota on replay", async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 23 }, () => enqueue()));
    expect(attempts.filter(attempt => attempt.status === "fulfilled")).toHaveLength(20);
    expect(await database.collection("agent_tasks").countDocuments({ reportId: report._id })).toBe(20);
  });
  it("only one worker may execute while the global lease is held", async () => {
    await enqueue();
    await database.collection<{ _id: string }>("agent_worker_lock").updateOne({ _id: "agent" }, { $set: { claimToken: randomUUID(), leaseUntil: new Date(Date.now() + 45000) } });
    expect(await new AgentWorker(database, mongo, async snapshot => fakeExtraction(snapshot)).runOnce()).toBe(false);
  });
  it("runs the actual Python dispatcher without passing database credentials", async () => {
    const fixtures = JSON.parse(await readFile("agents/fixtures/incidents.json", "utf8")) as { language: string; narrative: string }[];
    for (const fixture of fixtures) {
      report = await reports.create("owner-a", { synthetic: true, language: fixture.language, narrative: fixture.narrative }, randomUUID());
      const task = await enqueue(); await new AgentWorker(database, mongo, runFixtureSnapshot).runOnce();
      const receipt = await tasks.get("owner-a", report._id, task.id);
      expect(receipt.status).toBe("ready"); expect(receipt.result?.proposals).toHaveLength(6);
      for (const proposal of receipt.result!.proposals) expect(report.messages[0].text.slice(proposal.source.start, proposal.source.end)).toBe(proposal.quote);
    }
  });
});
