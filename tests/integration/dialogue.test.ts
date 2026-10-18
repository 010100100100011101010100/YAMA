import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { ReportRepository } from "@/server/reports/repository";
import { DialogueService, type DialogueRecord } from "@/server/dialogue/service";
import { DialogueWorker } from "@/server/dialogue/worker";
import type { Report } from "@/server/reports/domain";
import type { Dialogue } from "@/lib/dialogue";
import type { ConnectionsResult } from "@/lib/connections";
import { connectGraph, type GraphClient } from "@/server/database/graph-client";
import { GraphStore, syntheticCatalogue, type CatalogueCase } from "@/server/database/graph";
import { getServerConfig } from "@/server/config";
import { GraphWorker } from "@/server/jobs/graph-worker";
import { getConnections } from "@/server/reports/connections";
import { dialogueContext, runDialogueSnapshot } from "@/server/dialogue/runtime";

process.loadEnvFile(".env.local");
const namespace = `yama_dialogue_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin" });
let database: Db, reports: ReportRepository, service: DialogueService, report: Report;
let graphClient: GraphClient, graph: GraphStore;
const compare = (owner: string, id: string) => getConnections(reports, graph, owner, id);
async function confirmedComparison() {
  if (!graphClient) { const config = getServerConfig(); graphClient = await connectGraph(config.graphHost, config.graphPort, config.graphPassword); graph = new GraphStore(graphClient, namespace); }
  await graph.seedCatalogue(syntheticCatalogue);
  for (const entry of syntheticCatalogue) await database.collection<CatalogueCase>("catalogue").replaceOne({ _id: entry._id }, entry, { upsert: true });
  report = await reports.revise("owner-a", report._id, { operation: "propose_assertions", expectedRevision: report.revision, proposals: [
    { field: "pattern", value: "paid", source: report.assertions[0].source },
    { field: "pattern", value: "no_reply", polarity: "uncertain", source: report.assertions[0].source },
  ] });
  report = await reports.confirm("owner-a", report._id, { expectedRevision: report.revision, acknowledged: true });
}
const command = (state: Dialogue, operation: object) => service.change("owner-a", report._id, { expectedVersion: state.version, expectedRevision: report.revision, ...operation });
const start = async (agent = "saathi", automatic = true, key = randomUUID()) => command(await service.get("owner-a", report._id), { operation: "reply", key, language: report.language, messageId: report.messages.at(-1)!.id, agent, automatic });
const ack = (state: Dialogue) => command(state, { operation: "delivered", turnId: state.turn!.id });
beforeAll(async () => { database = mongo.db(namespace); await initializeSchema(database); reports = new ReportRepository(database, mongo); service = new DialogueService(database, mongo); });
beforeEach(async () => { await database.collection("dialogues").deleteMany({}); await database.collection("provider_budgets").deleteMany({});
  await database.collection("graph_outbox").deleteMany({});
  await database.collection<{ _id: string }>("agent_worker_lock").updateOne({ _id: "agent" }, { $set: { claimToken: null, leaseUntil: new Date(0) } });
  report = await reports.create("owner-a", { synthetic: true, language: "en", narrative: "Synthetic: I did not pay." }, randomUUID());
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { if (graphClient) { for (const name of await graphClient.list()) if (name.startsWith(`${namespace}_`)) await graphClient.selectGraph(name).delete(); await graphClient.close(); }
  await mongo.db(namespace).dropDatabase(); await mongo.close(); });

describe("persistent dialogue and delivery-bound handoffs", () => {
  it("keeps streamed drafts separate from delivery and removes rejected drafts", async () => {
    await start("saathi", false);
    await new DialogueWorker(database, mongo, async (_report, _record, _signal, _comparison, _public, progress) => {
      await progress!("A reviewed account can help us understand the sequence. ".repeat(5));
      const during = await service.get("owner-a", report._id);
      expect(during.turn?.preview?.text).toContain("A reviewed account");
      expect(during.messages).toHaveLength(0); expect(during.turn?.reply).toBeNull();
      expect(during.turn?.connectionReceipt).toBeUndefined();
      await expect(service.get("owner-b", report._id)).rejects.toMatchObject({ code: "report_not_found" });
      return { text: "A validated final answer.", handoff: null };
    }).runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.streamed).toBe(true); expect(ready.turn?.preview).toBeUndefined();
    expect(ready.turn?.status).toBe("ready"); await ack(ready); await start("saathi", false);
    await new DialogueWorker(database, mongo, async (_report, _record, _signal, _comparison, _public, progress) => {
      await progress!("A provisional answer. ".repeat(15)); return { text: "Rejected", handoff: null, forbidden: true };
    }).runOnce();
    const failed = await service.get("owner-a", report._id);
    expect(failed.turn?.status).toBe("failed"); expect(failed.turn?.preview).toBeUndefined(); expect(failed.messages).toHaveLength(1);
  });
  it("keeps a chat follow-up separate from confirmed incident facts and binds retries to its text", async () => {
    report = await reports.confirm("owner-a", report._id, { expectedRevision: report.revision, acknowledged: true });
    const before = await reports.get("owner-a", report._id), key = randomUUID();
    const input = { operation: "reply", key, language: "en", messageId: report.messages.at(-1)!.id, agent: "disha", automatic: false,
      userPrompt: "Which reports recovered any money?" };
    const started = await command(await service.get("owner-a", report._id), input);
    const runner = vi.fn(async (_report: Report, record: DialogueRecord) => {
      expect(record.turn!.userPrompt?.text).toBe(input.userPrompt);
      expect(dialogueContext(_report, record).messages.at(-1)?.text).toBe(input.userPrompt);
      return { text: "Let’s check the reported outcomes.", handoff: null };
    });
    const worker = new DialogueWorker(database, mongo, runner, async () => ({ status: "ready", reportId: report._id, revision: report.revision, recipe: "confirmed-pattern-sources-v1", sources: [], candidates: [] }));
    await worker.runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.userPrompt?.text).toBe(input.userPrompt);
    const delivered = await ack(ready);
    expect(delivered.messages.at(-1)?.userPrompt).toEqual(ready.turn?.userPrompt);
    const after = await reports.get("owner-a", report._id);
    expect({ revision: after.revision, confirmation: after.confirmation, assertions: after.assertions, messages: after.messages })
      .toEqual({ revision: before.revision, confirmation: before.confirmation, assertions: before.assertions, messages: before.messages });
    await command(delivered, input);
    await expect(command(delivered, { ...input, userPrompt: "A different question" })).rejects.toThrow("idempotency_conflict");
    expect(started.turn?.userPrompt?.id).toBe(ready.turn?.userPrompt?.id);
  });
  it("routes an @mention from saved text instead of trusting the requested agent", async () => {
    report = await reports.create("owner-a", { synthetic: true, language: "en", narrative: "Synthetic: @Drishti, explain the comparison." }, randomUUID());
    const initial = await start("disha", false);
    expect(initial.activeAgent).toBe("drishti");
    await new DialogueWorker(database, mongo).runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.agent).toBe("drishti");
    expect(ready.turn?.reply?.handoff).toBeNull();
    expect((await ack(ready)).messages.map(message => message.agent)).toEqual(["drishti"]);
  });

  it("delivers Saathi's explicit named-agent bridge before continuing, even with automatic handoffs off", async () => {
    report = await reports.create("owner-a", { synthetic: true, language: "hinglish", narrative: "Synthetic: Disha, agla step kya hai?" }, randomUUID());
    const initial = await start("drishti", false);
    expect(initial.activeAgent).toBe("saathi");
    const worker = new DialogueWorker(database, mongo);
    await worker.runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.reply?.text).toContain("@Disha");
    expect(ready.turn?.reply?.handoff).toEqual({ target: "disha", reason: "user_goal" });
    expect(ready.messages).toEqual([]);
    const handedOff = await ack(ready);
    expect(handedOff.activeAgent).toBe("disha");
    expect(handedOff.automatic).toBe(false);
    expect(handedOff.messages).toHaveLength(1);
    expect((await ack(ready)).turn?.id).toBe(handedOff.turn?.id);
    await worker.runOnce();
    const specialist = await service.get("owner-a", report._id);
    expect(specialist.turn?.reply?.handoff).toBeNull();
    expect((await ack(specialist)).messages.map(message => message.agent)).toEqual(["saathi", "disha"]);
    expect((await reports.get("owner-a", report._id)).messages.at(-1)?.text).toBe("Synthetic: Disha, agla step kya hai?");
  });

  it("rejects a generated handoff that returns to an agent already heard in this user turn", async () => {
    await start();
    const runner = async (_: Report, record: DialogueRecord) => record.turn?.agent === "saathi"
      ? { text: "@Drishti, explain comparison.", handoff: { target: "drishti", reason: "similar_cases" } }
      : { text: "@Saathi, start again.", handoff: { target: "saathi", reason: "clarification" } };
    const worker = new DialogueWorker(database, mongo, runner);
    await worker.runOnce();
    await ack(await service.get("owner-a", report._id));
    await worker.runOnce();
    const state = await service.get("owner-a", report._id);
    expect(state.turn?.status).toBe("failed");
    expect(state.turn?.reply).toBeNull();
    expect(state.messages.map(message => message.agent)).toEqual(["saathi"]);
  });

  it("cancels a requested named handoff and starts a fresh bounded request after a retry", async () => {
    report = await reports.create("owner-a", { synthetic: true, language: "en", narrative: "Synthetic: Disha, help with next steps." }, randomUUID());
    const initial = await start("saathi", false), worker = new DialogueWorker(database, mongo);
    await worker.runOnce();
    const ready = await service.get("owner-a", report._id);
    await command(ready, { operation: "stop" });
    await expect(ack(ready)).rejects.toMatchObject({ code: "conversation_conflict" });
    expect((await service.get("owner-a", report._id)).messages).toEqual([]);
    const restarted = await start("saathi", false);
    expect(restarted.turn?.id).not.toBe(initial.turn?.id);
    await worker.runOnce(); await ack(await service.get("owner-a", report._id));
    await worker.runOnce(); await ack(await service.get("owner-a", report._id));
    await start("saathi", false); await worker.runOnce();
    expect((await service.get("owner-a", report._id)).turn?.status).toBe("ready");
  });

  it("grounds Drishti in real scoped comparisons and persists a server-owned source receipt", async () => {
    await confirmedComparison(); await new GraphWorker(database, graph).runOnce(); await start("drishti");
    const worker = new DialogueWorker(database, mongo, runDialogueSnapshot, compare); await worker.runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.status).toBe("ready"); expect(ready.turn?.reply?.text).toContain("2 matching reports");
    expect(ready.turn?.reply?.text).toContain("identity linkage has not been assessed");
    expect(ready.turn?.connectionReceipt?.cases).toHaveLength(2);
    const record = await database.collection<DialogueRecord>("dialogues").findOne({ _id: report._id });
    const context = dialogueContext(report, record!, await compare("owner-a", report._id));
    expect(context.comparison?.blocked).toEqual([{ pattern: "no_reply", status: "uncertain" }]);
    expect(JSON.stringify(context)).not.toContain(report._id); expect(JSON.stringify(context)).not.toContain(report.messages[0].id);
    const delivered = await ack(ready); expect(delivered.activeAgent).toBe("disha");
    expect(delivered.messages[0].connectionReceipt).toEqual(ready.turn?.connectionReceipt);
    expect((await reports.get("owner-a", report._id)).assertions).toEqual(report.assertions);
    await expect(compare("owner-b", report._id)).rejects.toMatchObject({ code: "report_not_found" });
  });
  it("sends only reviewed reports to generation and persists all attachment decisions privately", async () => {
    await confirmedComparison(); await new GraphWorker(database, graph).runOnce(); await start("drishti", false);
    const reviewer = vi.fn(async (_report: Report, _record: DialogueRecord, comparison: ConnectionsResult) => ({ cases: comparison.candidates.map((candidate, index) => ({ id: candidate.id, decision: index === 0 ? "attach" : "omit", reason: index === 0 ? "Relevant recorded events" : "Not useful for this question" })) }));
    const runner = vi.fn(async (_report: Report, _record: DialogueRecord, _signal: AbortSignal, comparison?: ConnectionsResult) => {
      expect(comparison?.candidates).toHaveLength(1);
      return { text: "One report was useful for this comparison.", handoff: null };
    });
    await new DialogueWorker(database, mongo, runner, compare, reviewer).runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.status).toBe("ready"); expect(ready.turn?.connectionReceipt?.cases).toHaveLength(1);
    const review = await database.collection("dialogue_candidate_reviews").findOne({ reportId: report._id });
    expect(review?.cases.map((entry: { decision: string }) => entry.decision)).toEqual(["attach", "omit"]);
    expect(JSON.stringify(ready)).not.toContain("Not useful for this question");
  });
  it("reports projection pending without announcing a completed comparison", async () => {
    await confirmedComparison(); await start("drishti", false);
    await new DialogueWorker(database, mongo, runDialogueSnapshot, compare).runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.reply?.text).toContain("still being prepared"); expect(ready.turn?.connectionReceipt).toBeUndefined();
  });
  it("withdraws ready replies and handoffs when a cited catalogue example is withdrawn", async () => {
    await confirmedComparison(); await new GraphWorker(database, graph).runOnce(); await start("drishti");
    await new DialogueWorker(database, mongo, runDialogueSnapshot, compare).runOnce();
    const ready = await service.get("owner-a", report._id);
    await database.collection<CatalogueCase>("catalogue").updateOne({ _id: syntheticCatalogue[0]._id }, { $set: { published: false } });
    await expect(ack(ready)).rejects.toMatchObject({ code: "conversation_conflict" });
    const stale = await service.get("owner-a", report._id);
    expect(stale.turn?.status).toBe("stale"); expect(stale.turn?.reply).toBeNull(); expect(stale.activeAgent).toBe("drishti");
    await expect(ack(ready)).rejects.toMatchObject({ code: "conversation_conflict" }); expect(stale.messages).toEqual([]);
  });
  it("discards comparison prose when a catalogue source changes during generation", async () => {
    await confirmedComparison(); await new GraphWorker(database, graph).runOnce(); await start("drishti");
    const runner = async () => { await database.collection<CatalogueCase>("catalogue").updateOne({ _id: syntheticCatalogue[0]._id }, { $set: { summary: "Changed source" } }); return { text: "Old comparison", handoff: { target: "disha", reason: "next_actions" } }; };
    await new DialogueWorker(database, mongo, runner, compare).runOnce();
    const state = await service.get("owner-a", report._id);
    expect(state.turn?.status).toBe("stale"); expect(state.turn?.reply).toBeNull(); expect(state.messages).toEqual([]);
  });
  it("invalidates a grounded ready reply when the user corrects a cited assertion", async () => {
    await confirmedComparison(); await new GraphWorker(database, graph).runOnce(); await start("drishti");
    await new DialogueWorker(database, mongo, runDialogueSnapshot, compare).runOnce();
    report = await reports.revise("owner-a", report._id, { operation: "correct_assertion", expectedRevision: report.revision, assertionId: report.assertions[1].id, polarity: "contradicted" });
    const stale = await service.get("owner-a", report._id); expect(stale.turn?.status).toBe("stale"); expect(stale.turn?.reply).toBeNull();
  });
  it("delivers three roles in order only after acknowledgements, with refresh recovery", async () => {
    const initial = await start(); expect(initial.activeAgent).toBe("saathi");
    const worker = new DialogueWorker(database, mongo);
    for (const agent of ["saathi", "drishti", "disha"]) {
      await worker.runOnce();
      const ready = await service.get("owner-a", report._id);
      expect(ready.activeAgent).toBe(agent); expect(ready.turn?.status).toBe("ready");
      expect(ready.messages).toHaveLength(["saathi", "drishti", "disha"].indexOf(agent));
      const delivered = await ack(ready);
      expect(delivered.messages.at(-1)?.agent).toBe(agent);
    }
    const restored = await new DialogueService(database, mongo).get("owner-a", report._id);
    expect(restored.turn?.status).toBe("delivered"); expect(restored.messages).toHaveLength(3);
    expect((await reports.get("owner-a", report._id)).assertions).toEqual(report.assertions);
    expect(restored).not.toHaveProperty("ownerId"); expect(restored.turn).not.toHaveProperty("claimToken");
  });
  it("honours manual roles and disables automatic handoffs", async () => {
    await start("disha", false); await new DialogueWorker(database, mongo).runOnce();
    const ready = await service.get("owner-a", report._id);
    expect(ready.turn?.reply?.handoff).toBeNull();
    expect((await ack(ready)).activeAgent).toBe("disha");
  });
  it("serializes concurrent starts and delivery acknowledgements", async () => {
    const initial = await service.get("owner-a", report._id), key = randomUUID();
    const operation = { operation: "reply", key, messageId: report.messages[0].id, agent: "saathi", automatic: true, language: "en" };
    const starts = await Promise.all([command(initial, operation), command(initial, operation)]);
    expect(starts[0].turn?.id).toBe(starts[1].turn?.id);
    await new DialogueWorker(database, mongo).runOnce();
    const ready = await service.get("owner-a", report._id);
    const completions = await Promise.all([ack(ready), ack(ready)]);
    expect(completions[0].turn?.id).toBe(completions[1].turn?.id);
    expect((await service.get("owner-a", report._id)).messages).toHaveLength(1);
  });
  it("does not enqueue duplicate starts or duplicate delivery acknowledgements", async () => {
    const key = randomUUID(); const started = await start("saathi", true, key);
    const replay = await start("saathi", true, key); expect(replay.turn?.id).toBe(started.turn?.id);
    await new DialogueWorker(database, mongo).runOnce();
    const ready = await service.get("owner-a", report._id), delivered = await ack(ready);
    expect((await ack(ready)).version).toBe(delivered.version);
    expect((await service.get("owner-a", report._id)).messages).toHaveLength(1);
  });
  it("blocks another account, forged messages and stale controls", async () => {
    await expect(service.get("owner-b", report._id)).rejects.toMatchObject({ code: "report_not_found" });
    const initial = await service.get("owner-a", report._id);
    await expect(command(initial, { operation: "reply", key: randomUUID(), language: report.language, messageId: randomUUID(), agent: "saathi", automatic: true })).rejects.toMatchObject({ code: "invalid_message" });
    await command(initial, { operation: "select", agent: "drishti" });
    await expect(command(initial, { operation: "select", agent: "disha" })).rejects.toMatchObject({ code: "conversation_conflict" });
  });
  it("discards a late result after manual interruption", async () => {
    await start(); let release!: (value: unknown) => void;
    const pending = new Promise(done => { release = done; });
    const runner = vi.fn(() => pending), worker = new DialogueWorker(database, mongo, runner);
    const work = worker.runOnce(); await vi.waitFor(() => expect(runner).toHaveBeenCalled());
    await command(await service.get("owner-a", report._id), { operation: "select", agent: "disha" });
    release({ text: "Late answer", handoff: null }); await work;
    const current = await service.get("owner-a", report._id);
    expect(current.activeAgent).toBe("disha"); expect(current.turn?.status).toBe("canceled"); expect(current.turn?.reply).toBeNull();
  });
  it("discards stale results and pending handoffs after a report edit", async () => {
    await start(); await new DialogueWorker(database, mongo).runOnce();
    const ready = await service.get("owner-a", report._id);
    report = await reports.revise("owner-a", report._id, { expectedRevision: report.revision, operation: "correct_assertion", assertionId: report.assertions[0].id, value: "Corrected synthetic account" });
    expect((await service.get("owner-a", report._id)).turn?.status).toBe("stale");
    await expect(ack(ready)).rejects.toMatchObject({ code: "conversation_conflict" });
  });
  it("discards a reply when narration changes during generation", async () => {
    await start(); let release!: (value: unknown) => void;
    const pending = new Promise(done => { release = done; }), runner = vi.fn(() => pending);
    const work = new DialogueWorker(database, mongo, runner).runOnce();
    await vi.waitFor(() => expect(runner).toHaveBeenCalled());
    report = await reports.revise("owner-a", report._id, { expectedRevision: report.revision, operation: "add_message", text: "Synthetic correction: money was not sent." });
    release({ text: "Outdated answer", handoff: { target: "disha", reason: "next_actions" } }); await work;
    const current = await service.get("owner-a", report._id);
    expect(current.turn?.status).toBe("stale"); expect(current.turn?.reply).toBeNull(); expect(current.messages).toEqual([]);
  });
  it("rejects invalid self handoffs and provider instructions without report mutation", async () => {
    await start(); await new DialogueWorker(database, mongo, async () => ({ text: "Confirmed", handoff: { target: "saathi", reason: "user_goal" }, confirm: true })).runOnce();
    expect((await service.get("owner-a", report._id)).turn?.status).toBe("failed");
    expect((await reports.get("owner-a", report._id)).confirmation).toBeNull();
  });
  it("supports Hindi and Hinglish through the real private Python runtime", async () => {
    for (const language of ["hi", "hinglish"]) {
      report = await reports.create("owner-a", { synthetic: true, language, narrative: "काल्पनिक: भुगतान नहीं किया।" }, randomUUID());
      await start("disha", false); await new DialogueWorker(database, mongo).runOnce();
      const ready = await service.get("owner-a", report._id);
      expect(ready.turn?.agent).toBe("disha");
      expect(ready.turn?.reply?.text).toContain(language === "hi" ? "भुगतान" : "payment");
      expect(ready.turn?.reply?.text).not.toMatch(/मैं दिशा हूँ|Main Disha hoon/);
    }
  });
  it("shares the extraction call budget and refuses uncertain live replays", async () => {
    for (const [key, value] of Object.entries({ YAMA_TEXT_PROVIDER: "openai", YAMA_MODEL_LIVE_ENABLED: "true", YAMA_DEMO_ONLY: "true", YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED: "true", OPENAI_API_KEY: "never-sent", OPENAI_TEXT_MODEL: "test-model", YAMA_OPENAI_MAX_CALLS: "1" })) vi.stubEnv(key, value);
    const runner = vi.fn(async () => ({ text: "Bounded generated answer", handoff: null }));
    await start("disha", false); await new DialogueWorker(database, mongo, runner).runOnce();
    expect(runner).toHaveBeenCalledTimes(1); expect(await database.collection("provider_budgets").findOne({})).toMatchObject({ reservedCalls: 1 });
    await ack(await service.get("owner-a", report._id));
    await start("disha", false); await new DialogueWorker(database, mongo, runner).runOnce();
    expect((await service.get("owner-a", report._id)).turn?.errorCode).toBe("provider_budget_exhausted");
    const queued = await start("disha", false);
    await database.collection<DialogueRecord>("dialogues").updateOne({ _id: report._id }, { $set: { "turn.status": "running", "turn.attempts": 1, "turn.leaseUntil": new Date(0), "turn.claimToken": randomUUID() } });
    await new DialogueWorker(database, mongo, runner).runOnce();
    expect((await service.get("owner-a", report._id)).turn?.id).toBe(queued.turn?.id);
    expect((await service.get("owner-a", report._id)).turn?.errorCode).toBe("provider_call_uncertain"); expect(runner).toHaveBeenCalledTimes(1);
  });
  it("fails changed live configuration and blocks real calls in automated tests", async () => {
    for (const [key, value] of Object.entries({ YAMA_TEXT_PROVIDER: "openai", YAMA_MODEL_LIVE_ENABLED: "true", YAMA_DEMO_ONLY: "true", YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED: "true", OPENAI_API_KEY: "never-sent", OPENAI_TEXT_MODEL: "test-model" })) vi.stubEnv(key, value);
    const runner = vi.fn(async () => ({ text: "Reply", handoff: null }));
    await start("disha", false); vi.stubEnv("OPENAI_BASE_URL", "https://in.api.openai.com/v1");
    await new DialogueWorker(database, mongo, runner).runOnce();
    expect((await service.get("owner-a", report._id)).turn?.errorCode).toBe("provider_config_changed");
    expect(runner).not.toHaveBeenCalled(); expect(await database.collection("provider_budgets").countDocuments()).toBe(0);
    await start("disha", false); await new DialogueWorker(database, mongo).runOnce();
    expect((await service.get("owner-a", report._id)).turn?.errorCode).toBe("live_provider_disabled_in_tests");
    expect(await database.collection("provider_budgets").countDocuments()).toBe(0);
  });
  it("rejects oversized context before reserving a live call", async () => {
    for (const [key, value] of Object.entries({ YAMA_TEXT_PROVIDER: "openai", YAMA_MODEL_LIVE_ENABLED: "true", YAMA_DEMO_ONLY: "true", YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED: "true", OPENAI_API_KEY: "never-sent", OPENAI_TEXT_MODEL: "test-model" })) vi.stubEnv(key, value);
    for (let message = 0; message < 4; message++) report = await reports.revise("owner-a", report._id, { expectedRevision: report.revision, operation: "add_message", text: "Synthetic ".repeat(580) });
    const runner = vi.fn(async () => ({ text: "Reply", handoff: null }));
    await start(); await new DialogueWorker(database, mongo, runner).runOnce();
    expect((await service.get("owner-a", report._id)).turn?.errorCode).toBe("context_limit");
    expect(runner).not.toHaveBeenCalled(); expect(await database.collection("provider_budgets").countDocuments()).toBe(0);
  });
});
