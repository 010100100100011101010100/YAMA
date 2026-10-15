import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { z } from "zod";
import { RoomServiceClient } from "livekit-server-sdk";
import { voiceConfigHash, voiceSettings, voiceToken } from "./config";
import type { VoiceRecord } from "./records";
import { VoiceService } from "./service";
import { voiceEnvironment, voicePython } from "./runtime";
const eventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.enum(["ready", "speech_start", "failed"]) }),
  z.strictObject({
    type: z.enum(["partial", "final"]),
    text: z.string().min(1).max(6000),
  }),
]);
type MediaBindings = {
  url: string;
  token: string;
  identity: string;
  language: VoiceRecord["language"];
  seconds: number;
};
export type MediaRunner = (
  bindings: MediaBindings,
  emit: (event: z.infer<typeof eventSchema>) => Promise<void>,
  signal: AbortSignal,
) => Promise<void>;
export const runSpeechStream: MediaRunner = (bindings, emit, signal) =>
  new Promise((resolve, reject) => {
    const child = spawn(voicePython(), ["-m", "scripts.voice_stream"], {
      env: voiceEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let pending = "",
      bytes = 0,
      failure = false,
      chain = Promise.resolve();
    const canceled = () => {
      failure = true;
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", canceled, { once: true });
    if (signal.aborted) canceled();
    const timer = setTimeout(canceled, (bindings.seconds + 15) * 1000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      pending += chunk;
      if (bytes > 512 * 1024 || Buffer.byteLength(pending) > 65536)
        return canceled();
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        chain = chain
          .then(async () => {
            const event = eventSchema.parse(JSON.parse(line));
            if (event.type === "failed") throw new Error("voice_stream_failed");
            await emit(event);
          })
          .catch(() => {
            canceled();
          });
      }
    });
    child.stderr.on("data", () => undefined);
    child.stdin.on("error", canceled);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", canceled);
    };
    child.once("error", () => {
      cleanup();
      reject(new Error("voice_runtime_unavailable"));
    });
    child.once("close", (code) => {
      cleanup();
      void chain.then(() => {
        if (failure || code !== 0 || pending)
          reject(new Error("voice_stream_failed"));
        else resolve();
      });
    });
    child.stdin.end(JSON.stringify(bindings) + "\n");
  });
export class VoiceWorker {
  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
    private readonly runner: MediaRunner = runSpeechStream,
  ) {}
  async runOnce(signal: AbortSignal) {
    const sessions = this.db.collection<VoiceRecord>("voice_sessions");
    // A crashed provider connection is not replayed: billing outcome is unknown.
    const orphan = await sessions.findOne({
      status: { $in: ["queued", "listening"] },
      expiresAt: { $lte: new Date() },
    });
    if (orphan) {
      await new VoiceService(this.db, this.client).control(
        orphan.ownerId,
        orphan._id,
        { sessionId: orphan.id, operation: "text" },
      );
      return true;
    }
    const token = randomUUID();
    const record = await sessions.findOneAndUpdate(
      { status: "queued", claimToken: null },
      { $set: { claimToken: token } },
      { returnDocument: "after" },
    );
    if (!record) return false;
    const service = new VoiceService(this.db, this.client),
      canceled = new AbortController();
    let checking = false;
    const monitor = setInterval(() => {
      if (checking || canceled.signal.aborted) return;
      checking = true;
      service
        .bound(record.ownerId, record._id, record.id)
        .then(({ voice }) => {
          if (voice.claimToken !== token) canceled.abort();
        })
        .catch(() => canceled.abort())
        .finally(() => {
          checking = false;
        });
    }, 500);
    let settings: ReturnType<typeof voiceSettings> | undefined;
    try {
      settings = voiceSettings();
      if (
        record.configHash !== voiceConfigHash(settings) ||
        (process.env.NODE_ENV === "test" && this.runner === runSpeechStream)
      )
        throw new Error("voice_disabled");
      const seconds = Math.floor(
        (record.expiresAt.getTime() - Date.now()) / 1000,
      );
      if (seconds < 1) throw new Error("voice_session_stale");
      const workerToken = await voiceToken(
        settings,
        record.room,
        record.workerIdentity,
        true,
      );
      let lastPartial = 0;
      await this.runner(
        {
          url: settings.url,
          token: workerToken,
          identity: record.clientIdentity,
          language: record.language,
          seconds,
        },
        async (event) => {
          const current = await service.bound(
            record.ownerId,
            record._id,
            record.id,
          );
          if (current.voice.claimToken !== token || canceled.signal.aborted)
            throw new Error("voice_session_stale");
          if (event.type === "ready")
            await sessions.updateOne(
              {
                _id: record._id,
                id: record.id,
                claimToken: token,
                status: "queued",
              },
              { $set: { status: "listening" } },
            );
          if (
            event.type === "speech_start" &&
            current.conversation?.turn &&
            ["queued", "running", "ready"].includes(
              current.conversation.turn.status,
            )
          )
            await service.control(record.ownerId, record._id, {
              sessionId: record.id,
              operation: "interrupt",
            });
          if (event.type === "partial" && Date.now() - lastPartial > 500) {
            lastPartial = Date.now();
            await sessions.updateOne(
              { _id: record._id, id: record.id, claimToken: token },
              { $set: { partial: event.text } },
            );
          }
          if (event.type === "final") {
            if (current.voice.transcripts.length >= 8)
              throw new Error("transcript_limit");
            await sessions.updateOne(
              {
                _id: record._id,
                id: record.id,
                claimToken: token,
                "transcripts.7": { $exists: false },
              },
              {
                $push: {
                  transcripts: {
                    id: randomUUID(),
                    text: event.text,
                    status: "proposed",
                  },
                },
                $set: { partial: "" },
              },
            );
          }
        },
        AbortSignal.any([signal, canceled.signal]),
      );
      await service.control(record.ownerId, record._id, {
        sessionId: record.id,
        operation: "text",
      });
    } catch {
      const previous = await sessions.findOne({
        _id: record._id,
        id: record.id,
      });
      const unexpected =
        !!previous &&
        ["queued", "listening"].includes(previous.status) &&
        !signal.aborted &&
        !canceled.signal.aborted;
      await service
        .control(record.ownerId, record._id, {
          sessionId: record.id,
          operation: "text",
        })
        .catch(() => undefined);
      if (unexpected)
        await sessions.updateOne(
          { _id: record._id, id: record.id },
          {
            $set: {
              status: "failed",
              errorCode: "voice_stream_stopped",
              claimToken: null,
            },
          },
        );
    } finally {
      clearInterval(monitor);
      if (settings)
        await new RoomServiceClient(
          settings.url.replace(/^ws:/, "http:"),
          settings.key,
          settings.secret,
        )
          .deleteRoom(record.room)
          .catch(() => undefined);
    }
    return true;
  }
}
