import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Binary, type Db, type MongoClient, type ClientSession } from "mongodb";
import {
  voiceAcceptSchema,
  voiceStartSchema,
  voiceControlSchema,
  voiceViewSchema,
  voiceClipInput,
  voicePlaybackSchema,
  voiceClipSchema,
} from "@/lib/voice";
import {
  parse,
  publicReport,
  reviseReport,
  type Report,
} from "@/server/reports/domain";
import { revisionKey, type Revision } from "@/server/reports/repository";
import { ServiceError } from "@/server/errors";
import { resolveAgentAddress } from "@/lib/agent-addressing";
import {
  DialogueService,
  revokeTurn,
  queuedTurn,
  transactionOptions,
  type DialogueRecord,
} from "@/server/dialogue/service";
import {
  voiceSettings,
  voiceConfigHash,
  voiceToken,
  VOICE_SPEAKERS,
  type VoiceSettings,
} from "./config";
import { inspectVoiceWave } from "./audio";
import type { VoiceRecord, PlayoutRecord, VoiceBudget } from "./records";
import { synthesizeSpeech } from "./runtime";
import { receiptIsCurrent } from "@/server/reports/catalogue-policy";

export const publicVoice = (record: VoiceRecord) =>
  voiceViewSchema.parse({
    id: record.id,
    reportId: record._id,
    revision: record.revision,
    language: record.language,
    status: record.status,
    expiresAt: record.expiresAt.toISOString(),
    partial: record.partial,
    transcripts: record.transcripts,
    errorCode: record.errorCode,
  });
export type SpeechRunner = (
  text: string,
  agent: keyof typeof VOICE_SPEAKERS,
  language: VoiceRecord["language"],
  signal: AbortSignal,
) => Promise<Buffer>;
export class VoiceService {
  constructor(
    readonly database: Db,
    readonly client: MongoClient,
    private readonly settings: () => VoiceSettings = voiceSettings,
    private readonly speech: SpeechRunner = synthesizeSpeech,
  ) {}
  private get sessions() {
    return this.database.collection<VoiceRecord>("voice_sessions");
  }
  private get playbacks() {
    return this.database.collection<PlayoutRecord>("voice_playouts");
  }
  private get reports() {
    return this.database.collection<Report>("reports");
  }
  private get dialogues() {
    return this.database.collection<DialogueRecord>("dialogues");
  }
  async bound(
    ownerId: string,
    reportId: string,
    id: string,
    session?: ClientSession,
    active = true,
  ) {
    const report = await this.reports.findOne(
      { _id: reportId, ownerId },
      { session },
    );
    if (!report) throw new ServiceError(404, "report_not_found");
    const voice = await this.sessions.findOne(
      { _id: reportId, ownerId, id },
      { session },
    );
    if (!voice) throw new ServiceError(404, "voice_not_found");
    const conversation = await this.dialogues.findOne(
      { _id: reportId, ownerId },
      { session },
    );
    if (
      active &&
      (voice.expiresAt <= new Date() ||
        !["queued", "listening"].includes(voice.status) ||
        voice.revision !== report.revision ||
        conversation?.voiceSessionId !== voice.id ||
        conversation.language !== voice.language)
    )
      throw new ServiceError(409, "voice_session_stale");
    return { report, voice, conversation };
  }
  async start(ownerId: string, input: unknown) {
    const command = parse(voiceStartSchema, input),
      settings = this.settings();
    const requestHash = createHash("sha256")
      .update(JSON.stringify(command))
      .digest("hex");
    const saved = await this.client.withSession((session) =>
      session.withTransaction(async () => {
        const repeated = await this.sessions.findOne(
          { ownerId, requestKey: command.key },
          { session },
        );
        if (repeated) {
          if (repeated.requestHash !== requestHash)
            throw new ServiceError(409, "idempotency_conflict");
          const current = await this.bound(
            ownerId,
            repeated._id,
            repeated.id,
            session,
          );
          return { report: current.report, voice: repeated };
        }
        let report = command.reportId
          ? await this.reports.findOne(
              { _id: command.reportId, ownerId },
              { session },
            )
          : null;
        if (command.reportId && !report)
          throw new ServiceError(404, "report_not_found");
        if (report && report.revision !== command.expectedRevision)
          throw new ServiceError(409, "revision_conflict");
        if (
          report &&
          (
            await this.sessions.findOne(
              { _id: report._id, ownerId },
              { session },
            )
          )?.transcripts.some((item) => item.status === "proposed")
        )
          throw new ServiceError(409, "voice_review_pending");
        if (
          await this.sessions.findOne(
            {
              status: { $in: ["queued", "listening"] },
              expiresAt: { $gt: new Date() },
            },
            { session },
          )
        )
          throw new ServiceError(409, "voice_capacity");
        const budget = this.database.collection<VoiceBudget>("voice_budgets");
        await budget.updateOne(
          { _id: "sarvam-demo" },
          { $setOnInsert: { reservedSeconds: 0, reservedCalls: 0 } },
          { upsert: true, session },
        );
        const reserved = await budget.updateOne(
          {
            _id: "sarvam-demo",
            reservedSeconds: { $lte: settings.maxSeconds - settings.seconds },
          },
          { $inc: { reservedSeconds: settings.seconds } },
          { session },
        );
        if (!reserved.matchedCount)
          throw new ServiceError(422, "voice_budget_exhausted");
        const now = new Date();
        if (!report) {
          report = {
            _id: randomUUID(),
            ownerId,
            schemaVersion: 1,
            synthetic: true,
            language: command.language,
            creationKey: command.key,
            creationHash: requestHash,
            revision: 1,
            messages: [],
            assertions: [],
            confirmation: null,
            createdAt: now,
            updatedAt: now,
          };
          await this.reports.insertOne(report, { session });
          await this.database
            .collection<Revision>("report_revisions")
            .insertOne(
              {
                _id: revisionKey(report, "draft"),
                ownerId,
                reportId: report._id,
                revision: 1,
                kind: "draft",
                snapshot: report,
              },
              { session },
            );
        }
        const conversation = (await this.dialogues.findOne(
          { _id: report._id, ownerId },
          { session },
        )) ?? {
          _id: report._id,
          ownerId,
          version: 0,
          activeAgent: "saathi" as const,
          automatic: true,
          language: command.language,
          messages: [],
          turn: null,
          requests: [],
          updatedAt: now,
        };
        revokeTurn(conversation, "canceled");
        const id = randomUUID();
        conversation.voiceSessionId = id;
        conversation.language = command.language;
        conversation.version++;
        conversation.updatedAt = now;
        await this.dialogues.replaceOne(
          { _id: report._id, ownerId },
          conversation,
          { upsert: true, session },
        );
        const voice: VoiceRecord = {
          _id: report._id,
          id,
          ownerId,
          revision: report.revision,
          language: command.language,
          requestKey: command.key,
          requestHash,
          configHash: voiceConfigHash(settings),
          room: `yama-voice-${id}`,
          clientIdentity: `user-${randomUUID()}`,
          workerIdentity: `worker-${randomUUID()}`,
          expiresAt: new Date(now.getTime() + settings.seconds * 1000),
          status: "queued",
          partial: "",
          transcripts: [],
          errorCode: null,
          claimToken: null,
        };
        await this.sessions.replaceOne({ _id: report._id }, voice, {
          upsert: true,
          session,
        });
        await this.reports.updateOne(
          { _id: report._id, ownerId },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
        return { report, voice };
      }, transactionOptions),
    );
    return {
      report: publicReport(saved.report),
      session: publicVoice(saved.voice),
      url: settings.url,
      token: await voiceToken(
        settings,
        saved.voice.room,
        saved.voice.clientIdentity,
        false,
      ),
    };
  }
  async get(ownerId: string, reportId: string, id: string) {
    const current = await this.bound(ownerId, reportId, id, undefined, false);
    if (
      ["queued", "listening"].includes(current.voice.status) &&
      (current.voice.expiresAt <= new Date() ||
        current.voice.revision !== current.report.revision ||
        current.conversation?.voiceSessionId !== id ||
        current.conversation.language !== current.voice.language)
    ) {
      await this.control(ownerId, reportId, {
        sessionId: id,
        operation: "stop",
      });
      await this.sessions.updateOne(
        { _id: reportId, ownerId, id },
        { $set: { status: "stale" } },
      );
      return publicVoice(
        (await this.bound(ownerId, reportId, id, undefined, false)).voice,
      );
    }
    return publicVoice(current.voice);
  }
  async accept(ownerId: string, reportId: string, input: unknown) {
    const command = parse(voiceAcceptSchema, input);
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const current = await this.bound(
            ownerId,
            reportId,
            command.sessionId,
            session,
            false,
          ),
          transcript = current.voice.transcripts.find(
            (item) => item.id === command.utteranceId,
          );
        if (!transcript) throw new ServiceError(404, "transcript_not_found");
        if (transcript.status === "accepted") {
          if (transcript.acceptedText !== command.text)
            throw new ServiceError(409, "idempotency_conflict");
          return {
            report: publicReport(current.report),
            session: publicVoice(current.voice),
          };
        }
        if (transcript.status !== "proposed")
          throw new ServiceError(409, "transcript_not_ready");
        if (current.report.revision !== command.expectedRevision)
          throw new ServiceError(409, "revision_conflict");
        const report = reviseReport(current.report, {
          operation: "add_message",
          expectedRevision: command.expectedRevision,
          text: command.text,
        });
        const message = report.messages.at(-1)!;
        message.voiceSource = {
          sessionId: current.voice.id,
          utteranceId: transcript.id,
          rawTranscript: transcript.text,
          model: "saaras:v4",
          language: current.voice.language,
        };
        Object.assign(transcript, {
          status: "accepted",
          acceptedText: command.text,
          messageId: message.id,
        });
        current.voice.revision = report.revision;
        current.voice.partial = "";
        const conversation = current.conversation!;
        if (conversation.requests.length >= 20)
          throw new ServiceError(422, "conversation_limit");
        revokeTurn(conversation, "canceled");
        conversation.version++;
        conversation.updatedAt = new Date();
        const address = resolveAgentAddress(message.text, conversation.activeAgent);
        conversation.activeAgent = address.initialAgent;
        conversation.turn = queuedTurn(
          report,
          conversation.activeAgent,
          message.id,
        );
        conversation.turn.address = address;
        conversation.turn.language = conversation.language;
        conversation.requests.push({
          key: transcript.id,
          messageId: message.id,
          revision: report.revision,
          agent: conversation.activeAgent,
          language: conversation.language,
          automatic: conversation.automatic,
        });
        await this.reports.replaceOne(
          { _id: reportId, ownerId, revision: current.report.revision },
          report,
          { session },
        );
        await this.database
          .collection<Revision>("report_revisions")
          .insertOne(
            {
              _id: revisionKey(report, "draft"),
              ownerId,
              reportId,
              revision: report.revision,
              kind: "draft",
              snapshot: report,
            },
            { session },
          );
        await this.sessions.replaceOne(
          { _id: reportId, ownerId, id: current.voice.id },
          current.voice,
          { session },
        );
        await this.dialogues.replaceOne(
          { _id: reportId, ownerId },
          conversation,
          { session },
        );
        await this.playbacks.updateMany(
          { reportId, ownerId, status: { $in: ["preparing", "ready"] } },
          { $set: { status: "canceled", audio: null } },
          { session },
        );
        return {
          report: publicReport(report),
          session: publicVoice(current.voice),
        };
      }, transactionOptions),
    );
  }
  async control(ownerId: string, reportId: string, input: unknown) {
    const command = parse(voiceControlSchema, input);
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const current = await this.bound(
            ownerId,
            reportId,
            command.sessionId,
            session,
            false,
          ),
          conversation = current.conversation;
        if (command.operation === "discard") {
          const transcript = current.voice.transcripts.find(
            (item) => item.id === command.utteranceId,
          );
          if (!transcript || transcript.status !== "proposed")
            throw new ServiceError(409, "transcript_not_ready");
          transcript.status = "discarded";
        } else {
          if (command.operation === "stop" || command.operation === "text") {
            current.voice.status = "stopped";
            current.voice.claimToken = null;
            current.voice.partial = "";
          }
          if (conversation?.voiceSessionId === current.voice.id) {
            if (
              command.operation !== "text" ||
              conversation.turn?.status !== "ready"
            )
              revokeTurn(conversation, "canceled");
            if (command.operation === "stop" || command.operation === "text")
              delete conversation.voiceSessionId;
            conversation.version++;
            conversation.updatedAt = new Date();
            await this.dialogues.replaceOne(
              { _id: reportId, ownerId },
              conversation,
              { session },
            );
          }
          await this.playbacks.updateMany(
            {
              reportId,
              ownerId,
              sessionId: current.voice.id,
              status: { $in: ["preparing", "ready"] },
            },
            { $set: { status: "canceled", audio: null } },
            { session },
          );
        }
        await this.sessions.replaceOne(
          { _id: reportId, ownerId, id: current.voice.id },
          current.voice,
          { session },
        );
        await this.reports.updateOne(
          { _id: reportId, ownerId },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
        return publicVoice(current.voice);
      }, transactionOptions),
    );
  }
  async synthesize(ownerId: string, reportId: string, input: unknown) {
    const command = parse(voiceClipInput, input),
      settings = this.settings(),
      id = `${command.sessionId}:${command.turnId}`;
    const prepared = await this.client.withSession((session) =>
      session.withTransaction(async () => {
        const { report, voice, conversation } = await this.bound(
          ownerId,
          reportId,
          command.sessionId,
          session,
        );
        if (voice.configHash !== voiceConfigHash(settings))
          throw new ServiceError(409, "voice_config_changed");
        const turn = conversation?.turn;
        if (
          report.revision !== command.expectedRevision ||
          turn?.revision !== report.revision
        )
          throw new ServiceError(409, "revision_conflict");
        if (
          turn.id !== command.turnId ||
          turn.status !== "ready" ||
          !turn.reply
        )
          throw new ServiceError(409, "reply_not_ready");
        if (
          turn.connectionReceipt &&
          (report.confirmation?.revision !== report.revision ||
            !(await receiptIsCurrent(
              this.database,
              turn.connectionReceipt,
              session,
            )))
        )
          throw new ServiceError(409, "reply_not_ready");
        if (turn.reply.text.length > 2500)
          throw new ServiceError(422, "voice_text_limit");
        const existing = await this.playbacks.findOne(
          { _id: id, ownerId, reportId },
          { session },
        );
        if (existing)
          return { record: existing, fresh: false, text: turn.reply.text };
        const reserved = await this.database
          .collection<VoiceBudget>("voice_budgets")
          .updateOne(
            { _id: "sarvam-demo", reservedCalls: { $lt: settings.maxCalls } },
            { $inc: { reservedCalls: 1 } },
            { session },
          );
        if (!reserved.matchedCount)
          throw new ServiceError(422, "voice_budget_exhausted");
        const record: PlayoutRecord = {
          _id: id,
          id,
          ownerId,
          sessionId: voice.id,
          reportId,
          revision: report.revision,
          turnId: turn.id,
          nonce: randomUUID(),
          agent: turn.agent,
          speaker: VOICE_SPEAKERS[turn.agent],
          status: "preparing",
          audio: null,
          sha256: "0".repeat(64),
          durationMs: 1,
          dialogueVersion: conversation!.version,
          startedAt: null,
          expiresAt: new Date(Date.now() + 600000),
          errorCode: null,
        };
        await this.playbacks.insertOne(record, { session });
        await this.reports.updateOne(
          { _id: reportId, ownerId },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
        return { record, fresh: true, text: turn.reply.text };
      }, transactionOptions),
    );
    if (prepared.fresh) {
      const canceled = new AbortController();
      let checking = false;
      const monitor = setInterval(() => {
        if (checking || canceled.signal.aborted) return;
        checking = true;
        this.bound(ownerId, reportId, command.sessionId)
          .then(({ conversation }) => {
            if (
              conversation?.version !== prepared.record.dialogueVersion ||
              conversation.turn?.id !== command.turnId ||
              conversation.turn.status !== "ready"
            )
              canceled.abort();
          })
          .catch(() => canceled.abort())
          .finally(() => {
            checking = false;
          });
      }, 500);
      try {
        const audio = await this.speech(
          prepared.text,
          prepared.record.agent,
          (await this.bound(ownerId, reportId, command.sessionId)).voice
            .language,
          AbortSignal.any([canceled.signal, AbortSignal.timeout(30000)]),
        );
        if (canceled.signal.aborted)
          throw new ServiceError(409, "voice_session_stale");
        const { durationMs } = inspectVoiceWave(audio);
        await this.client.withSession((session) =>
          session.withTransaction(async () => {
            const { conversation } = await this.bound(
              ownerId,
              reportId,
              command.sessionId,
              session,
            );
            if (
              conversation?.version !== prepared.record.dialogueVersion ||
              conversation.turn?.id !== command.turnId ||
              conversation.turn.status !== "ready"
            )
              throw new ServiceError(409, "voice_session_stale");
            if (
              conversation.turn.connectionReceipt &&
              !(await receiptIsCurrent(
                this.database,
                conversation.turn.connectionReceipt,
                session,
              ))
            )
              throw new ServiceError(409, "reply_not_ready");
            await this.reports.updateOne(
              { _id: reportId, ownerId, revision: prepared.record.revision },
              { $inc: { agentTaskFence: 1 } },
              { session },
            );
            await this.playbacks.updateOne(
              { _id: id, ownerId, status: "preparing" },
              {
                $set: {
                  status: "ready",
                  audio: new Binary(audio),
                  sha256: createHash("sha256").update(audio).digest("hex"),
                  durationMs,
                },
              },
              { session },
            );
          }, transactionOptions),
        );
      } catch {
        await this.playbacks.updateOne(
          { _id: id, ownerId, status: "preparing" },
          {
            $set: { status: "failed", audio: null, errorCode: "speech_failed" },
          },
        );
      } finally {
        clearInterval(monitor);
      }
    }
    const record = await this.playbacks.findOne({ _id: id, ownerId, reportId });
    if (!record || record.status !== "ready")
      throw new ServiceError(
        record?.status === "preparing" ? 409 : 503,
        record?.status === "preparing" ? "speech_pending" : "speech_failed",
      );
    return voiceClipSchema.parse({
      id: record.id,
      sessionId: record.sessionId,
      reportId,
      revision: record.revision,
      turnId: record.turnId,
      nonce: record.nonce,
      agent: record.agent,
      speaker: record.speaker,
      sha256: record.sha256,
      durationMs: record.durationMs,
    });
  }
  async audio(ownerId: string, reportId: string, clipId: string) {
    await new DialogueService(this.database, this.client).get(
      ownerId,
      reportId,
    );
    const clip = await this.playbacks.findOne({
      _id: clipId,
      ownerId,
      reportId,
      status: "ready",
      expiresAt: { $gt: new Date() },
    });
    if (!clip || !clip.audio)
      throw new ServiceError(404, "voice_audio_not_found");
    const { conversation } = await this.bound(
      ownerId,
      reportId,
      clip.sessionId,
    );
    if (
      conversation?.turn?.id !== clip.turnId ||
      conversation.turn.status !== "ready" ||
      conversation.version !== clip.dialogueVersion
    )
      throw new ServiceError(409, "voice_session_stale");
    return Buffer.from(clip.audio.buffer);
  }
  async playback(ownerId: string, reportId: string, input: unknown) {
    const command = parse(voicePlaybackSchema, input);
    if (command.operation === "ended")
      return new DialogueService(this.database, this.client).voiceDelivered(
        ownerId,
        reportId,
        command,
      );
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const { conversation } = await this.bound(
          ownerId,
          reportId,
          command.sessionId,
          session,
        );
        const clip = await this.playbacks.findOne(
          {
            _id: command.clipId,
            ownerId,
            reportId,
            sessionId: command.sessionId,
            nonce: command.nonce,
            status: "ready",
          },
          { session },
        );
        if (
          !clip ||
          conversation?.turn?.id !== clip.turnId ||
          conversation.version !== clip.dialogueVersion
        )
          throw new ServiceError(409, "voice_not_played");
        if (!clip.startedAt)
          await this.playbacks.updateOne(
            { _id: clip._id, ownerId },
            { $set: { startedAt: new Date() } },
            { session },
          );
        await this.reports.updateOne(
          { _id: reportId, ownerId },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
        return { started: true };
      }, transactionOptions),
    );
  }
}
