import "server-only";
import { randomUUID } from "node:crypto";
import { MongoServerError, type Db, type MongoClient } from "mongodb";
import { z } from "zod";
import { type AgentAdapter, type AgentTask, type ExtractionResult } from "@/lib/agent-task";
import { ServiceError } from "@/server/errors";
import { parse, publicReport, type Report } from "@/server/reports/domain";
import { ReportRepository, revisionKey, type Revision } from "@/server/reports/repository";
import { acceptProposals, resultHash } from "./domain";
import { textAdapter, executionConfigHash } from "./config";

export type AgentTaskRecord = {
  _id: string; ownerId: string; reportId: string; requestKey: string; revision: number;
  agent: "saathi"; tool: "propose_draft_assertions"; status: AgentTask["status"]; attempts: number;
  adapter: AgentAdapter; executionConfigHash?: string | null; result: ExtractionResult | null; resultHash: string | null;
  accepted: AgentTask["accepted"]; errorCode: string | null; claimToken: string | null; leaseUntil: Date | null;
  createdAt: Date; updatedAt: Date;
};
const enqueueInput = z.strictObject({ expectedRevision: z.number().int().positive() });
const acceptance = z.strictObject({ expectedRevision: z.number().int().positive(), acknowledged: z.literal(true),
  resultHash: z.string().regex(/^[a-f0-9]{64}$/), proposalIds: z.array(z.uuid()).min(1).max(20) })
  .refine(input => new Set(input.proposalIds).size === input.proposalIds.length);
const transactionOptions = { writeConcern: { w: "majority" as const }, readConcern: { level: "snapshot" as const } };
const currentStatuses: AgentTask["status"][] = ["queued", "running", "ready"];
export function publicTask(task: AgentTaskRecord): AgentTask {
  return { id: task._id, reportId: task.reportId, revision: task.revision, agent: task.agent, tool: task.tool,
    status: task.status, attempts: task.attempts, adapter: task.adapter, result: task.result, resultHash: task.resultHash,
    accepted: task.accepted, errorCode: task.errorCode };
}
export class AgentTaskService {
  private readonly reports: ReportRepository;
  constructor(readonly database: Db, private readonly client: MongoClient) { this.reports = new ReportRepository(database, client); }
  private get records() { return this.database.collection<AgentTaskRecord>("agent_tasks"); }
  async enqueue(ownerId: string, reportId: string, input: unknown, requestKey: string) {
    const { expectedRevision } = parse(enqueueInput, input); parse(z.uuid(), requestKey);
    const reuse = (task: AgentTaskRecord) => {
      if (task.revision !== expectedRevision) throw new ServiceError(409, "idempotency_conflict");
      return task;
    };
    let queued: AgentTaskRecord;
    try {
      queued = await this.client.withSession(session => session.withTransaction(async () => {
        const report = await this.database.collection<Report>("reports").findOne({ _id: reportId, ownerId }, { session });
        if (!report) throw new ServiceError(404, "report_not_found");
        const existing = await this.records.findOne({ ownerId, reportId, requestKey }, { session });
        if (existing) return reuse(existing);
        if (report.revision !== expectedRevision) throw new ServiceError(409, "revision_conflict");
        const reserved = await this.database.collection<Report>("reports").updateOne({ _id: reportId, ownerId, revision: expectedRevision,
          $or: [{ agentTaskCount: { $exists: false } }, { agentTaskCount: { $lt: 20 } }] }, { $inc: { agentTaskCount: 1 } }, { session });
        if (!reserved.matchedCount) throw new ServiceError(422, "agent_task_limit");
        const now = new Date();
        const task: AgentTaskRecord = { _id: randomUUID(), ownerId, reportId, requestKey, revision: expectedRevision, agent: "saathi", tool: "propose_draft_assertions",
          status: "queued", attempts: 0, adapter: textAdapter(), result: null, resultHash: null, accepted: null, errorCode: null,
          claimToken: null, leaseUntil: null, createdAt: now, updatedAt: now };
        task.executionConfigHash = task.adapter.live ? executionConfigHash() : null;
        await this.records.insertOne(task, { session }); return task;
      }, transactionOptions));
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const existing = await this.records.findOne({ ownerId, reportId, requestKey });
      if (!existing) throw error; queued = reuse(existing);
    }
    return publicTask(queued);
  }
  private async currentReport(ownerId: string, reportId: string) {
    const report = await this.reports.get(ownerId, reportId);
    await this.records.updateMany({ ownerId, reportId, revision: { $lt: report.revision }, status: { $in: currentStatuses } },
      { $set: { status: "stale", result: null, resultHash: null, claimToken: null, leaseUntil: null, updatedAt: new Date() } });
    return report;
  }
  private checkResult(task: AgentTaskRecord) {
    if (["ready", "accepted"].includes(task.status) && (!task.result || !task.resultHash || resultHash(task.result, task.adapter) !== task.resultHash)) {
      throw new ServiceError(503, "invalid_task_result");
    }
  }
  async get(ownerId: string, reportId: string, id: string): Promise<AgentTask> {
    await this.currentReport(ownerId, reportId);
    const task = await this.records.findOne({ _id: id, ownerId, reportId });
    if (!task) throw new ServiceError(404, "task_not_found");
    const latest = await this.reports.get(ownerId, reportId);
    if (currentStatuses.includes(task.status) && task.revision !== latest.revision) {
      await this.currentReport(ownerId, reportId);
      const updated = await this.records.findOne({ _id: id, ownerId, reportId });
      if (!updated) throw new ServiceError(404, "task_not_found");
      this.checkResult(updated); return publicTask(updated);
    }
    this.checkResult(task); return publicTask(task);
  }
  async list(ownerId: string, reportId: string): Promise<AgentTask[]> {
    await this.currentReport(ownerId, reportId);
    const tasks = await this.records.find({ ownerId, reportId }).sort({ createdAt: -1, _id: -1 }).limit(20).toArray();
    const latest = await this.reports.get(ownerId, reportId);
    if (tasks.some(task => currentStatuses.includes(task.status) && task.revision !== latest.revision)) {
      await this.currentReport(ownerId, reportId);
      const updated = await this.records.find({ ownerId, reportId }).sort({ createdAt: -1, _id: -1 }).limit(20).toArray();
      updated.forEach(task => this.checkResult(task)); return updated.map(publicTask);
    }
    tasks.forEach(task => this.checkResult(task)); return tasks.map(publicTask);
  }
  async cancel(ownerId: string, reportId: string, id: string) {
    const task = await this.get(ownerId, reportId, id);
    if (task.status === "accepted") throw new ServiceError(409, "task_already_accepted");
    await this.records.updateOne({ _id: id, ownerId, reportId, status: { $in: currentStatuses } },
      { $set: { status: "canceled", result: null, resultHash: null, claimToken: null, leaseUntil: null, updatedAt: new Date() } });
    return this.get(ownerId, reportId, id);
  }
  async accept(ownerId: string, reportId: string, id: string, input: unknown) {
    await this.reports.get(ownerId, reportId);
    const approved = parse(acceptance, input);
    const selection = [...approved.proposalIds].sort();
    return this.client.withSession(session => session.withTransaction(async () => {
      const report = await this.database.collection<Report>("reports").findOne({ _id: reportId, ownerId }, { session });
      if (!report) throw new ServiceError(404, "report_not_found");
      const task = await this.records.findOne({ _id: id, ownerId, reportId }, { session });
      if (!task) throw new ServiceError(404, "task_not_found");
      this.checkResult(task);
      if (approved.expectedRevision !== task.revision || approved.resultHash !== task.resultHash) throw new ServiceError(409, "revision_conflict");
      if (task.status === "accepted") {
        if (JSON.stringify(task.accepted!.proposalIds) !== JSON.stringify(selection)) throw new ServiceError(409, "idempotency_conflict");
        return { report: publicReport(report), task: publicTask(task) };
      }
      if (report.revision !== task.revision) throw new ServiceError(409, "revision_conflict");
      if (task.status !== "ready" || !task.result) throw new ServiceError(409, "task_not_ready");
      const chosen = task.result.proposals.filter(proposal => selection.includes(proposal.id));
      if (chosen.length !== selection.length) throw new ServiceError(400, "invalid_selection");
      const next = acceptProposals(report, id, chosen, approved.expectedRevision, task.adapter);
      const replaced = await this.database.collection<Report>("reports").replaceOne({ _id: reportId, ownerId, revision: report.revision }, next, { session });
      if (!replaced.matchedCount) throw new ServiceError(409, "revision_conflict");
      await this.database.collection<Revision>("report_revisions").insertOne({ _id: revisionKey(next, "draft"), ownerId, reportId, revision: next.revision, kind: "draft", snapshot: next }, { session });
      const accepted: AgentTaskRecord = { ...task, status: "accepted", updatedAt: new Date(), accepted: {
        revision: next.revision, proposalIds: selection, assertionIds: next.assertions.slice(report.assertions.length).map(assertion => assertion.id) } };
      const written = await this.records.replaceOne({ _id: id, ownerId, reportId, status: "ready", resultHash: approved.resultHash }, accepted, { session });
      if (!written.matchedCount) throw new ServiceError(409, "task_not_ready");
      return { report: publicReport(next), task: publicTask(accepted) };
    }, transactionOptions));
  }
}
