import { z } from "zod";
import { reportSchema, ReportApiError, type SavedReport } from "./report-api";
import {
  voiceViewSchema,
  voiceClipSchema,
  type VoiceView,
  type VoiceClip,
} from "./voice";
const configuration = z.strictObject({
  enabled: z.boolean(),
  seconds: z.number().positive().max(180),
  speakers: z.strictObject({
    saathi: z.literal("priya"),
    drishti: z.literal("shubh"),
    disha: z.literal("suhani"),
  }),
});
const accepted = z.strictObject({
  report: reportSchema,
  session: voiceViewSchema,
});
const started = accepted.extend({
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "ws:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  }),
  token: z.string().min(20).max(8192),
});
export type VoiceApi = {
  config: (signal: AbortSignal) => Promise<z.infer<typeof configuration>>;
  start: (
    report: SavedReport | null,
    language: VoiceView["language"],
    key: string,
  ) => Promise<z.infer<typeof started>>;
  get: (reportId: string, signal: AbortSignal) => Promise<VoiceView | null>;
  control: (
    reportId: string,
    sessionId: string,
    operation: "stop" | "text" | "interrupt" | "discard",
    utteranceId?: string,
  ) => Promise<VoiceView>;
  accept: (
    reportId: string,
    sessionId: string,
    utteranceId: string,
    revision: number,
    text: string,
  ) => Promise<z.infer<typeof accepted>>;
  speech: (
    reportId: string,
    sessionId: string,
    turnId: string,
    revision: number,
    signal: AbortSignal,
  ) => Promise<VoiceClip>;
  audio: (clip: VoiceClip, signal: AbortSignal) => Promise<ArrayBuffer>;
  playback: (clip: VoiceClip, operation: "started" | "ended") => Promise<void>;
};
export function createVoiceApi(): VoiceApi {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    signal?: AbortSignal,
    timeout = 10000,
  ) {
    try {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
          : AbortSignal.timeout(timeout),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = z
          .object({ error: z.object({ code: z.string() }) })
          .safeParse(payload);
        throw new ReportApiError(
          failure.success ? failure.data.error.code : "voice_unavailable",
        );
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new ReportApiError("invalid_response");
      return parsed.data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
      if (error instanceof ReportApiError) throw error;
      throw new ReportApiError("voice_unavailable");
    }
  }
  const path = (reportId: string) => `/api/reports/${reportId}/voice`;
  const valid = (session: VoiceView, reportId: string, sessionId?: string) => {
    if (
      session.reportId !== reportId ||
      (sessionId && session.id !== sessionId)
    )
      throw new ReportApiError("invalid_response");
    return session;
  };
  return {
    config: (signal) =>
      request("/api/voice/config", configuration, undefined, signal),
    async start(report, language, key) {
      const response = await request("/api/voice/start", started, {
        reportId: report?._id ?? null,
        expectedRevision: report?.revision ?? null,
        language,
        key,
        consented: true,
      });
      valid(response.session, response.report._id);
      if (
        (report && response.report._id !== report._id) ||
        response.report.revision !== response.session.revision
      )
        throw new ReportApiError("invalid_response");
      return response;
    },
    async get(reportId, signal) {
      const response = await request(
        path(reportId),
        z.strictObject({ session: voiceViewSchema.nullable() }),
        undefined,
        signal,
      );
      return response.session ? valid(response.session, reportId) : null;
    },
    async control(reportId, sessionId, operation, utteranceId) {
      const response = await request(
        path(reportId),
        z.strictObject({ session: voiceViewSchema }),
        { sessionId, operation, ...(utteranceId ? { utteranceId } : {}) },
      );
      return valid(response.session, reportId, sessionId);
    },
    async accept(reportId, sessionId, utteranceId, revision, text) {
      const response = await request(`${path(reportId)}/accept`, accepted, {
        sessionId,
        utteranceId,
        expectedRevision: revision,
        text,
        acknowledged: true,
      });
      valid(response.session, reportId, sessionId);
      if (
        response.report._id !== reportId ||
        response.report.revision !== response.session.revision
      )
        throw new ReportApiError("invalid_response");
      return response;
    },
    async speech(reportId, sessionId, turnId, revision, signal) {
      const clip = await request(
        `${path(reportId)}/speech`,
        voiceClipSchema,
        { sessionId, turnId, expectedRevision: revision },
        signal,
        35000,
      );
      if (
        clip.reportId !== reportId ||
        clip.sessionId !== sessionId ||
        clip.turnId !== turnId ||
        clip.revision !== revision
      )
        throw new ReportApiError("invalid_response");
      return clip;
    },
    async audio(clip, signal) {
      const response = await fetch(
        `${path(clip.reportId)}/audio?clipId=${encodeURIComponent(clip.id)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        },
      );
      if (!response.ok || response.headers.get("content-type") !== "audio/wav")
        throw new ReportApiError("voice_audio_unavailable");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 3_000_044)
        throw new ReportApiError("voice_audio_limit");
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      if (digest !== clip.sha256)
        throw new ReportApiError("invalid_voice_audio");
      return bytes;
    },
    async playback(clip, operation) {
      await request(`${path(clip.reportId)}/playback`, z.unknown(), {
        sessionId: clip.sessionId,
        clipId: clip.id,
        nonce: clip.nonce,
        operation,
      });
    },
  };
}
export const voiceApi = createVoiceApi();
