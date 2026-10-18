import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { validateReply } from "@/lib/dialogue";
import { ServiceError } from "@/server/errors";
import type { Report } from "@/server/reports/domain";
import { executionConfigHash, providerCallSettings, textAdapter } from "@/server/agents/config";
import { reserveProviderCall } from "@/server/agents/budget";
import { transactionOptions, type DialogueRecord } from "./service";
import { dialogueContext, runDialogueSnapshot, runCandidateReviewSnapshot, reviewedComparison, type DialogueRunner, type CandidateReviewer } from "./runtime";
import { type ConnectionsResult, type ConnectionReceipt } from "@/lib/connections";
import { getConnections } from "@/server/reports/connections";
import { receiptIsCurrent } from "@/server/reports/catalogue-policy";
import { ReportRepository } from "@/server/reports/repository";
import { requestedHandoff } from "@/lib/agent-addressing";
import { getGraphClient, GraphStore } from "@/server/database/graph";
import { protectReply } from "./privacy";
import { loadDialoguePublicSources } from "./public-sources";
import type { CandidateReview } from "@/lib/retrieval";

type WorkerLock = { _id: string; claimToken: string | null; leaseUntil: Date };
export class DialogueWorker {
  constructor(private readonly database: Db, private readonly client: MongoClient, private readonly runner: DialogueRunner = runDialogueSnapshot,
    private readonly loadComparison = async (ownerId: string, reportId: string) => getConnections(new ReportRepository(database, client), new GraphStore(await getGraphClient(), database.databaseName), ownerId, reportId),
    private readonly reviewer: CandidateReviewer = runCandidateReviewSnapshot) {}
  async runOnce(signal: AbortSignal = new AbortController().signal) {
    if (signal.aborted) return false;
    const now = new Date(), token = randomUUID(), leaseUntil = new Date(now.getTime() + 480_000);
    const locks = this.database.collection<WorkerLock>("agent_worker_lock"), records = this.database.collection<DialogueRecord>("dialogues");
    const lock = await locks.findOneAndUpdate({ _id: "agent", leaseUntil: { $lte: now } }, { $set: { claimToken: token, leaseUntil } }, { returnDocument: "after" });
    if (!lock) return false;
    const canceled = new AbortController(); let monitor: ReturnType<typeof setInterval> | undefined;
    try {
      const record = await records.findOneAndUpdate({ $or: [{ "turn.status": "queued" }, { "turn.status": "running", "turn.leaseUntil": { $lte: now } }] },
        { $set: { "turn.status": "running", "turn.claimToken": token, "turn.leaseUntil": leaseUntil, updatedAt: now }, $inc: { "turn.attempts": 1, version: 1 } }, { sort: { updatedAt: 1 }, returnDocument: "after" });
      if (!record) return false;
      const turn = record.turn!;
      const claim = { _id: record._id, ownerId: record.ownerId, "turn.id": turn.id, "turn.status": "running", "turn.claimToken": token };
      let checking = false;
      monitor = setInterval(() => {
        if (checking || canceled.signal.aborted) return; checking = true;
        Promise.all([records.findOne(claim, { projection: { _id: 1 } }), this.database.collection<Report>("reports").findOne({ _id: record._id, ownerId: record.ownerId, revision: turn.revision }, { projection: { _id: 1 } })])
          .then(([current, report]) => { if (!current || !report) canceled.abort(); }).catch(() => canceled.abort()).finally(() => { checking = false; });
      }, 1000);
      try {
        if (turn.attempts > 3) throw new ServiceError(422, "retry_limit");
        const report = await this.database.collection<Report>("reports").findOne({ _id: record._id, ownerId: record.ownerId });
        if (!report || report.revision !== turn.revision) throw new ServiceError(409, "revision_conflict");
        let comparison: ConnectionsResult | undefined;
        if (["drishti", "disha"].includes(turn.agent) && report.confirmation?.revision === report.revision) comparison = await this.loadComparison(record.ownerId, record._id);
        if (comparison && (comparison.reportId !== report._id || comparison.revision !== report.revision)) throw new ServiceError(409, "revision_conflict");
        const discovered = comparison;
        const reserve = async (reviewing = false) => {
          if (!turn.adapter.live) return;
          if ((reviewing ? this.reviewer === runCandidateReviewSnapshot : this.runner === runDialogueSnapshot) && process.env.NODE_ENV === "test") throw new ServiceError(503, "live_provider_disabled_in_tests");
          if (turn.attempts !== 1) throw new ServiceError(503, "provider_call_uncertain");
          if (JSON.stringify(textAdapter()) !== JSON.stringify(turn.adapter) || executionConfigHash() !== turn.executionConfigHash) throw new ServiceError(503, "provider_config_changed");
          const settings = providerCallSettings();
          await reserveProviderCall(this.database, settings.maxCalls, settings.budget);
        };
        let review: CandidateReview | undefined;
        if (comparison?.status === "ready" && comparison.candidates.length) {
          dialogueContext(report, record, comparison);
          await reserve(true);
          const checked = reviewedComparison(comparison, await this.reviewer(report, record, comparison, AbortSignal.any([signal, canceled.signal])));
          comparison = checked.comparison; review = checked.review;
        }
        const publicContext = await loadDialoguePublicSources(this.database, this.client, report, record, AbortSignal.any([signal, canceled.signal]));
        const receipt: ConnectionReceipt | undefined = comparison?.status === "ready" ? { recipe: comparison.recipe, revision: comparison.revision,
          cases: comparison.candidates.map(candidate => ({ id: candidate.id, version: candidate.explanation.catalogueVersion })) } : undefined;
        dialogueContext(report, record, comparison, publicContext); // Fail oversized context before reserving a paid call.
        await reserve();
        let sequence = 0, previous = "";
        const progress = async (text: string) => {
          if (signal.aborted || canceled.signal.aborted || record.voiceSessionId) return;
          if (text.length > 4000 || !text.startsWith(previous)) throw new ServiceError(503, "invalid_model_output");
          previous = text;
          // Hold a tail so a split private name cannot flash on screen before redaction.
          const prefix = text.slice(0, Math.max(0, text.length - 128));
          const safe = protectReply({ text: prefix.slice(0, Math.max(0, prefix.lastIndexOf(" "))) }).text;
          if (!safe) return;
          const written = await records.updateOne(claim, { $set: { "turn.preview": { text: safe, sequence: ++sequence } } });
          if (!written.matchedCount) canceled.abort();
        };
        const output = await this.runner(report, record, AbortSignal.any([signal, canceled.signal]), comparison, publicContext, record.voiceSessionId ? undefined : progress);
        if (signal.aborted || canceled.signal.aborted) throw new ServiceError(409, "processing_interrupted");
        const directed = requestedHandoff(turn.address, turn.agent, turn.depth);
        const parsedReply = validateReply(output, turn.agent, record.automatic || !!directed, turn.depth);
        const reply = parsedReply ? validateReply(protectReply(parsedReply, comparison?.candidates.map(candidate => candidate.id) ?? []), turn.agent, record.automatic || !!directed, turn.depth) : null;
        const visited = turn.visited ?? [];
        if (!reply || directed && (reply.handoff?.target !== directed || reply.handoff.reason !== "user_goal") || reply.handoff && visited.includes(reply.handoff.target)) throw new ServiceError(503, "invalid_model_output");
        await this.client.withSession(session => session.withTransaction(async () => {
          const current = await records.findOne({ ...claim, "turn.leaseUntil": { $gt: new Date() } }, { session });
          if (!current) return;
          const catalogueCurrent = !receipt || await receiptIsCurrent(this.database, receipt, session);
          const reportFence = await this.database.collection<Report>("reports").updateOne({ _id: record._id, ownerId: record.ownerId, revision: turn.revision,
            ...(receipt ? { "confirmation.revision": turn.revision } : {}) }, { $inc: { agentTaskFence: 1 } }, { session });
          const ready = !!reportFence.matchedCount && catalogueCurrent;
          if (ready && review) await this.database.collection<{ _id: string; ownerId: string; reportId: string; revision: number; agent: string; adapter: unknown; reviewedAt: Date; cases: unknown[] }>("dialogue_candidate_reviews").updateOne({ _id: turn.id }, { $setOnInsert: {
            ownerId: record.ownerId, reportId: record._id, revision: turn.revision, agent: turn.agent, adapter: turn.adapter, reviewedAt: new Date(),
            cases: review.cases.map(entry => ({ ...entry, version: discovered!.candidates.find(candidate => candidate.id === entry.id)!.explanation.catalogueVersion })),
          } }, { upsert: true, session });
          await records.updateOne(claim, { $set: { "turn.status": ready ? "ready" : "stale", "turn.reply": ready ? reply : null,
            "turn.streamed": sequence > 0,
            ...(ready && receipt ? { "turn.connectionReceipt": receipt } : {}),
            ...(ready && publicContext ? { "turn.publicContext": publicContext } : {}),
            "turn.errorCode": null, "turn.claimToken": null, "turn.leaseUntil": null, updatedAt: new Date() }, $unset: { "turn.preview": "" }, $inc: { version: 1 } }, { session });
        }, transactionOptions));
      } catch (error) {
        const code = error instanceof ServiceError ? error.code : "dialogue_failed";
        const sameRevision = await this.database.collection<Report>("reports").findOne({ _id: record._id, ownerId: record.ownerId, revision: turn.revision }, { projection: { _id: 1 } });
        await records.updateOne(claim, { $set: { "turn.status": !sameRevision || code === "revision_conflict" ? "stale" : "failed", "turn.errorCode": code,
          "turn.reply": null, "turn.claimToken": null, "turn.leaseUntil": null, updatedAt: new Date() }, $unset: { "turn.preview": "" }, $inc: { version: 1 } });
      }
      return true;
    } finally {
      if (monitor) clearInterval(monitor);
      await locks.updateOne({ _id: "agent", claimToken: token }, { $set: { claimToken: null, leaseUntil: new Date(0) } });
    }
  }
}
