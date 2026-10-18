import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { ServiceError } from "@/server/errors";
import type { Report } from "@/server/reports/domain";
import { validateExtraction, resultHash } from "./domain";
import type { AgentTaskRecord } from "./service";
import { runAgentSnapshot, type AgentRunner } from "./runtime";
import { executionConfigHash, providerCallSettings, textAdapter } from "./config";
import { reserveProviderCall } from "./budget";

type WorkerLock = { _id: string; claimToken: string | null; leaseUntil: Date };
export class AgentWorker {
  constructor(private readonly database: Db, private readonly client: MongoClient, private readonly runner: AgentRunner = runAgentSnapshot) {}
  async runOnce(signal: AbortSignal = new AbortController().signal) {
    if (signal.aborted) return false;
    // Covers the bounded Codex process deadline (180 seconds plus shutdown overhead).
    const now = new Date(), token = randomUUID(), leaseUntil = new Date(now.getTime() + 210_000);
    const locks = this.database.collection<WorkerLock>("agent_worker_lock"), tasks = this.database.collection<AgentTaskRecord>("agent_tasks");
    const lock = await locks.findOneAndUpdate({ _id: "agent", leaseUntil: { $lte: now } }, { $set: { claimToken: token, leaseUntil } }, { returnDocument: "after" });
    if (!lock) return false;
    let monitor: ReturnType<typeof setInterval> | undefined;
    const canceled = new AbortController();
    try {
      const task = await tasks.findOneAndUpdate({ $or: [{ status: "queued" }, { status: "running", leaseUntil: { $lte: now } }] },
        { $set: { status: "running", claimToken: token, leaseUntil, updatedAt: now }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, returnDocument: "after" });
      if (!task) return false;
      const claim = { _id: task._id, ownerId: task.ownerId, reportId: task.reportId, status: "running" as const, claimToken: token };
      let checking = false;
      monitor = setInterval(() => {
        if (checking || canceled.signal.aborted) return;
        checking = true;
        tasks.findOne(claim, { projection: { _id: 1 } }).then(current => { if (!current) canceled.abort(); }).catch(() => canceled.abort()).finally(() => { checking = false; });
      }, 1000);
      try {
        if (task.attempts > 3) throw new ServiceError(422, "retry_limit");
        const report = await this.database.collection<Report>("reports").findOne({ _id: task.reportId, ownerId: task.ownerId });
        if (!report || report.revision !== task.revision) throw new ServiceError(409, "revision_conflict");
        if (task.adapter.live) {
          if (this.runner === runAgentSnapshot && process.env.NODE_ENV === "test") throw new ServiceError(503, "live_provider_disabled_in_tests");
          if (task.attempts !== 1) throw new ServiceError(503, "provider_call_uncertain");
          if (JSON.stringify(textAdapter()) !== JSON.stringify(task.adapter) || executionConfigHash() !== task.executionConfigHash) throw new ServiceError(503, "provider_config_changed");
          const settings = providerCallSettings();
          await reserveProviderCall(this.database, settings.maxCalls, settings.budget);
        }
        const output = await this.runner(report, AbortSignal.any([signal, canceled.signal]), task.adapter);
        if (signal.aborted || canceled.signal.aborted) throw new ServiceError(409, "task_canceled");
        const extraction = validateExtraction(report, output);
        await this.client.withSession(session => session.withTransaction(async () => {
          const active = await tasks.findOne({ ...claim, leaseUntil: { $gt: new Date() } }, { session });
          if (!active) return;
          // Write the report fence: a concurrent user edit must conflict/retry,
          // rather than allowing completion from a stale transaction snapshot.
          const current = await this.database.collection<Report>("reports").updateOne({ _id: task.reportId, ownerId: task.ownerId, revision: task.revision }, { $inc: { agentTaskFence: 1 } }, { session });
          if (!current.matchedCount) {
            await tasks.updateOne(claim, { $set: { status: "stale", result: null, resultHash: null, claimToken: null, leaseUntil: null, updatedAt: new Date() } }, { session }); return;
          }
          await tasks.updateOne(claim, { $set: { status: "ready", result: extraction, resultHash: resultHash(extraction, task.adapter), errorCode: null, claimToken: null, leaseUntil: null, updatedAt: new Date() } }, { session });
        }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } }));
      } catch (error) {
        const code = error instanceof ServiceError ? error.code : "extraction_failed";
        await tasks.updateOne(claim, { $set: { status: code === "revision_conflict" ? "stale" : "failed", errorCode: signal.aborted ? "processing_interrupted" : code,
          result: null, resultHash: null, claimToken: null, leaseUntil: null, updatedAt: new Date() } });
      }
      return true;
    } finally {
      if (monitor) clearInterval(monitor);
      await locks.updateOne({ _id: "agent", claimToken: token }, { $set: { claimToken: null, leaseUntil: new Date(0) } });
    }
  }
}
