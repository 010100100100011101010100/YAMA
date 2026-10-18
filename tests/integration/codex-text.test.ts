import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { ReportRepository } from "@/server/reports/repository";
import { AgentTaskService, type AgentTaskRecord } from "@/server/agents/service";
import { AgentWorker } from "@/server/agents/worker";
import { DialogueService } from "@/server/dialogue/service";
import { DialogueWorker } from "@/server/dialogue/worker";
import type { Report } from "@/server/reports/domain";
import type { Dialogue } from "@/lib/dialogue";

process.loadEnvFile(".env.local");
const namespace = `yama_codex_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", {
  auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin",
});
let database: Db, reports: ReportRepository, report: Report, tasks: AgentTaskService, dialogue: DialogueService;
beforeAll(async () => {
  database = mongo.db(namespace); await initializeSchema(database);
  reports = new ReportRepository(database, mongo); tasks = new AgentTaskService(database, mongo); dialogue = new DialogueService(database, mongo);
});
beforeEach(async () => {
  for (const [name, value] of Object.entries({ YAMA_TEXT_PROVIDER: "codex", YAMA_CODEX_ENABLED: "true", YAMA_DEMO_ONLY: "true", YAMA_CODEX_BINARY: "codex", YAMA_CODEX_MAX_CALLS: "10" })) vi.stubEnv(name, value);
  for (const name of ["agent_tasks", "dialogues", "provider_budgets"]) await database.collection(name).deleteMany({});
  await database.collection<{ _id: string }>("agent_worker_lock").updateOne({ _id: "agent" }, { $set: { claimToken: null, leaseUntil: new Date(0) } });
  report = await reports.create("codex-owner", { synthetic: true, language: "en", narrative: "Synthetic case: I paid ₹2,000 for a phone." }, randomUUID());
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await mongo.db(namespace).dropDatabase(); await mongo.close(); });

describe("Codex provider persistence using deterministic injected runners", () => {
  it("keeps extraction provenance, a separate usage budget and a lease covering the CLI deadline", async () => {
    const task = await tasks.enqueue("codex-owner", report._id, { expectedRevision: report.revision }, randomUUID());
    const runner = vi.fn(async (snapshot: Report) => {
      const claim = await database.collection<AgentTaskRecord>("agent_tasks").findOne({ _id: task.id });
      expect(claim!.leaseUntil!.getTime() - Date.now()).toBeGreaterThan(180_000);
      const message = snapshot.messages[0], start = message.text.indexOf("₹2,000");
      return { proposals: [{ field: "amount", value: "₹2,000", quote: "₹2,000", polarity: "affirmed", source: { messageId: message.id, start, end: start + 6 } }], skippedExisting: 0 };
    });
    await new AgentWorker(database, mongo, runner).runOnce();
    const ready = await tasks.get("codex-owner", report._id, task.id);
    expect(ready.status).toBe("ready");
    const accepted = await tasks.accept("codex-owner", report._id, task.id, { expectedRevision: ready.revision,
      acknowledged: true, resultHash: ready.resultHash, proposalIds: ready.result!.proposals.map(proposal => proposal.id) });
    expect(accepted.report.assertions.at(-1)?.agentSource).toMatchObject({ provider: "codex", model: "codex-session" });
    expect(await database.collection("provider_budgets").findOne({})).toMatchObject({ _id: "codex-synthetic-demo", reservedCalls: 1 });
    expect(await database.collection("provider_budgets").countDocuments()).toBe(1);
  });

  it("delivers all three roles through the ordinary server handoff contract", async () => {
    const change = async (state: Dialogue, command: object) => dialogue.change("codex-owner", report._id,
      { expectedVersion: state.version, expectedRevision: report.revision, ...command });
    await change(await dialogue.get("codex-owner", report._id), { operation: "reply", key: randomUUID(),
      messageId: report.messages.at(-1)!.id, agent: "saathi", automatic: true, language: "en" });
    const worker = new DialogueWorker(database, mongo, async (_, record) => {
      const agent = record.turn!.agent;
      return { text: agent === "saathi" ? "@Drishti, compare this account." : agent === "drishti" ? "@Disha, explain next steps." : "We can review the available next steps.",
        handoff: agent === "saathi" ? { target: "drishti", reason: "similar_cases" } : agent === "drishti" ? { target: "disha", reason: "next_actions" } : null };
    });
    for (let step = 0; step < 3; step++) {
      await worker.runOnce();
      const ready = await dialogue.get("codex-owner", report._id);
      expect(ready.turn?.status).toBe("ready");
      await change(ready, { operation: "delivered", turnId: ready.turn!.id });
    }
    const current = await dialogue.get("codex-owner", report._id);
    expect(current.messages.map(message => message.agent)).toEqual(["saathi", "drishti", "disha"]);
    expect(current.messages.every(message => message.adapter.provider === "codex")).toBe(true);
    expect(await database.collection("provider_budgets").findOne({})).toMatchObject({ _id: "codex-synthetic-demo", reservedCalls: 3 });
    await expect(dialogue.get("another-owner", report._id)).rejects.toThrow("report_not_found");
  });

  it("does not replay an uncertain Codex call after a worker crash", async () => {
    const task = await tasks.enqueue("codex-owner", report._id, { expectedRevision: report.revision }, randomUUID());
    await database.collection<AgentTaskRecord>("agent_tasks").updateOne({ _id: task.id }, { $set: {
      status: "running", attempts: 1, leaseUntil: new Date(0), claimToken: randomUUID(),
    } });
    const runner = vi.fn(); await new AgentWorker(database, mongo, runner).runOnce();
    expect(runner).not.toHaveBeenCalled();
    expect((await tasks.get("codex-owner", report._id, task.id)).errorCode).toBe("provider_call_uncertain");
  });
});
