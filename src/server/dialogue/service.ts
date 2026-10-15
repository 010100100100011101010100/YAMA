import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { dialogueCommandSchema, dialogueSchema, type Dialogue } from "@/lib/dialogue";
import { parse, type Report } from "@/server/reports/domain";
import { ServiceError } from "@/server/errors";
import { textAdapter, executionConfigHash } from "@/server/agents/config";
import { receiptIsCurrent } from "@/server/reports/catalogue-policy";
import { resolveAgentAddress, requestedHandoff, type AgentAddress } from "@/lib/agent-addressing";
import type { VoiceRecord, PlayoutRecord } from "@/server/voice/records";
import type { z } from "zod";
import type { voicePlaybackSchema } from "@/lib/voice";

type RequestReceipt = { key: string; messageId: string; revision: number; agent: Dialogue["activeAgent"]; automatic: boolean; language: Dialogue["language"] };
export type DialogueTurn = NonNullable<Dialogue["turn"]> & { depth: number; attempts: number; claimToken: string | null; leaseUntil: Date | null; executionConfigHash: string | null; address?: AgentAddress; visited?: Dialogue["activeAgent"][] };
export type DialogueRecord = Omit<Dialogue, "reportId" | "turn"> & { _id: string; ownerId: string; turn: DialogueTurn | null; requests: RequestReceipt[]; updatedAt: Date };
export const transactionOptions = { writeConcern: { w: "majority" as const }, readConcern: { level: "snapshot" as const } };
export const activeTurn = (turn: DialogueTurn | null) => !!turn && ["queued", "running", "ready"].includes(turn.status);
export function publicDialogue(record: DialogueRecord): Dialogue {
  const turn = record.turn;
  return dialogueSchema.parse({ reportId: record._id, version: record.version, activeAgent: record.activeAgent, automatic: record.automatic, language: record.language,
    messages: record.messages, turn: turn ? { id: turn.id, agent: turn.agent, revision: turn.revision, messageId: turn.messageId,
      status: turn.status, adapter: turn.adapter, reply: turn.reply, errorCode: turn.errorCode, language: turn.language,
      ...(turn.connectionReceipt ? { connectionReceipt: turn.connectionReceipt } : {}) } : null,
    ...(record.voiceSessionId ? { voiceSessionId: record.voiceSessionId } : {}) });
}
export function queuedTurn(report: Report, agent: Dialogue["activeAgent"], messageId: string, depth = 0, previous?: DialogueTurn): DialogueTurn {
  const adapter = previous?.adapter ?? textAdapter();
  return { id: randomUUID(), agent, revision: report.revision, messageId, depth, status: "queued", attempts: 0,
    adapter, language: previous?.language ?? report.language, reply: null, errorCode: null, claimToken: null, leaseUntil: null,
    executionConfigHash: previous?.executionConfigHash ?? (adapter.live ? executionConfigHash() : null),
    visited: previous ? [...(previous.visited ?? []), previous.agent] : [], ...(previous?.address ? { address: previous.address } : {}) };
}
export function revokeTurn(record: DialogueRecord, status: "canceled" | "stale") {
  if (activeTurn(record.turn)) record.turn = { ...record.turn!, status, reply: null, errorCode: null, claimToken: null, leaseUntil: null };
}
export class DialogueService {
  constructor(private readonly database: Db, private readonly client: MongoClient) {}
  private get records() { return this.database.collection<DialogueRecord>("dialogues"); }
  private async transact(ownerId: string, reportId: string, input?: unknown, playback?: z.infer<typeof voicePlaybackSchema>): Promise<Dialogue> {
    const command = input === undefined ? null : parse(dialogueCommandSchema, input);
    return this.client.withSession(session => session.withTransaction(async () => {
      const report = await this.database.collection<Report>("reports").findOne({ _id: reportId, ownerId }, { session });
      if (!report) throw new ServiceError(404, "report_not_found");
      let record = await this.records.findOne({ _id: reportId, ownerId }, { session });
      const existed = !!record;
      record ??= { _id: reportId, ownerId, version: 0, activeAgent: "saathi", automatic: true, language: report.language, messages: [], turn: null, requests: [], updatedAt: new Date() };
      const priorVersion = record.version;
      if (activeTurn(record.turn) && record.turn!.revision !== report.revision) { revokeTurn(record, "stale"); record.version++; }
      if (record.turn?.status === "ready" && record.turn.connectionReceipt
          && (report.confirmation?.revision !== report.revision || !await receiptIsCurrent(this.database, record.turn.connectionReceipt, session))) {
        revokeTurn(record, "stale"); record.version++;
      }
      if (command) {
        if (playback) {
          const clip = await this.database.collection<PlayoutRecord>("voice_playouts").findOne({ _id: playback.clipId, ownerId, reportId, sessionId: playback.sessionId, nonce: playback.nonce }, { session });
          if (!clip || command.operation !== "delivered" || clip.turnId !== command.turnId) throw new ServiceError(409, "voice_not_played");
          if (clip.status !== "played") {
            const voice = await this.database.collection<VoiceRecord>("voice_sessions").findOne({ _id: reportId, ownerId, id: playback.sessionId, status: "listening", expiresAt: { $gt: new Date() } }, { session });
            if (!voice || voice.revision !== report.revision || record.voiceSessionId !== voice.id || clip.status !== "ready" || clip.expiresAt <= new Date()
                || !clip.startedAt || Date.now() < clip.startedAt.getTime() + clip.durationMs || record.version !== clip.dialogueVersion) throw new ServiceError(409, "voice_not_played");
            await this.database.collection<VoiceRecord>("voice_sessions").updateOne({ _id: reportId, ownerId, id: voice.id }, { $inc: { fence: 1 } }, { session });
            await this.database.collection<PlayoutRecord>("voice_playouts").updateOne({ _id: clip._id, ownerId, status: "ready" }, { $set: { status: "played", audio: null } }, { session });
          }
        }
        // Replay delivery/start receipts before version checks, so a lost response
        // cannot generate a second provider call or a second automatic handoff.
        const replay = command.operation === "reply" && record.requests.find(receipt => receipt.key === command.key);
        const delivered = command.operation === "delivered" && record.messages.some(message => message.id === command.turnId);
        if (replay) {
          if (replay.messageId !== command.messageId || replay.revision !== command.expectedRevision || replay.agent !== command.agent || replay.automatic !== command.automatic || replay.language !== command.language) throw new ServiceError(409, "idempotency_conflict");
        } else if (!delivered) {
          if (report.revision !== command.expectedRevision) throw new ServiceError(409, "revision_conflict");
          if (record.version !== command.expectedVersion) throw new ServiceError(409, "conversation_conflict");
          if (command.operation === "reply") {
            if (report.messages.at(-1)?.id !== command.messageId) throw new ServiceError(400, "invalid_message");
            if (record.requests.length >= 20) throw new ServiceError(422, "conversation_limit");
            record.requests.push({ key: command.key, messageId: command.messageId, revision: report.revision, agent: command.agent, automatic: command.automatic, language: command.language });
            const address = resolveAgentAddress(report.messages.at(-1)!.text, command.agent);
            record.activeAgent = address.initialAgent; record.automatic = command.automatic; record.language = command.language;
            record.turn = queuedTurn(report, address.initialAgent, command.messageId);
            record.turn.address = address;
            record.turn.language = command.language;
          } else if (command.operation === "delivered") {
            if (record.voiceSessionId && !playback) throw new ServiceError(409, "voice_playout_required");
            const turn = record.turn;
            if (!turn || turn.id !== command.turnId || turn.status !== "ready" || !turn.reply) throw new ServiceError(409, "reply_not_ready");
            record.messages.push({ id: turn.id, agent: turn.agent, revision: turn.revision, messageId: turn.messageId, text: turn.reply.text, adapter: turn.adapter, language: turn.language,
              ...(turn.reply.handoff ? {handoff:turn.reply.handoff} : {}),
              ...(turn.connectionReceipt ? { connectionReceipt: turn.connectionReceipt } : {}) });
            const directed = requestedHandoff(turn.address, turn.agent, turn.depth);
            const visited = [...(turn.visited ?? []), turn.agent];
            const target = directed ?? (record.automatic && turn.depth < 2 ? turn.reply.handoff?.target : null);
            if (target && (visited.includes(target) || directed && turn.reply.handoff?.target !== directed)) throw new ServiceError(409, "invalid_handoff");
            if (target) { record.activeAgent = target; record.turn = queuedTurn(report, target, turn.messageId, turn.depth + 1, turn); }
            else record.turn = { ...turn, status: "delivered" };
          } else {
            revokeTurn(record, "canceled");
            if (command.operation === "select") record.activeAgent = command.agent;
            if (command.operation === "automatic") record.automatic = command.enabled;
            if (command.operation === "language") record.language = command.language;
          }
          record.version++;
        }
      }
      if (!existed || record.version !== priorVersion) {
        // A report write fence makes concurrent corrections conflict with every
        // generation/delivery transition. It never changes the report revision.
        const fence = await this.database.collection<Report>("reports").updateOne({ _id: reportId, ownerId, revision: report.revision }, { $inc: { agentTaskFence: 1 } }, { session });
        if (!fence.matchedCount) throw new ServiceError(409, "revision_conflict");
        record.updatedAt = new Date();
        if (!existed) await this.records.insertOne(record, { session });
        else {
          const written = await this.records.replaceOne({ _id: reportId, ownerId, version: priorVersion }, record, { session });
          if (!written.matchedCount) throw new ServiceError(409, "conversation_conflict");
        }
      }
      return publicDialogue(record);
    }, transactionOptions));
  }
  get(ownerId: string, reportId: string) { return this.transact(ownerId, reportId); }
  change(ownerId: string, reportId: string, input: unknown) { return this.transact(ownerId, reportId, input); }
  async voiceDelivered(ownerId: string, reportId: string, playback: z.infer<typeof voicePlaybackSchema>) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await this.get(ownerId, reportId);
      const clip = await this.database.collection<PlayoutRecord>("voice_playouts").findOne({ _id: playback.clipId, ownerId, reportId, nonce: playback.nonce, sessionId: playback.sessionId });
      if (!clip) throw new ServiceError(409, "voice_not_played");
      try { return await this.transact(ownerId, reportId, { operation: "delivered", expectedRevision: clip.revision, expectedVersion: current.version, turnId: clip.turnId }, playback); }
      catch (error) { if (!(error instanceof ServiceError) || error.code !== "conversation_conflict" || attempt > 0) throw error; }
    }
    throw new ServiceError(409, "conversation_conflict");
  }
}
