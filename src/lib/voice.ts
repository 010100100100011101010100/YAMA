import { z } from "zod";
export const voiceStartSchema = z
  .strictObject({
    reportId: z.uuid().nullable(),
    expectedRevision: z.number().int().positive().nullable(),
    key: z.uuid(),
    language: z.enum(["en", "hi", "hinglish"]),
    consented: z.literal(true),
  })
  .refine(
    (value) => (value.reportId === null) === (value.expectedRevision === null),
  );
export const voiceViewSchema = z.strictObject({
  id: z.uuid(),
  reportId: z.uuid(),
  revision: z.number().int().positive(),
  language: z.enum(["en", "hi", "hinglish"]),
  expiresAt: z.iso.datetime(),
  status: z.enum(["queued", "listening", "stopped", "failed", "stale"]),
  partial: z.string().max(6000),
  errorCode: z.string().nullable(),
  transcripts: z
    .array(
      z.strictObject({
        id: z.uuid(),
        text: z.string().min(1).max(6000),
        status: z.enum(["proposed", "accepted", "discarded"]),
        acceptedText: z.string().min(1).max(6000).optional(),
        messageId: z.uuid().optional(),
      }),
    )
    .max(8),
});
export type VoiceView = z.infer<typeof voiceViewSchema>;
export const voiceAcceptSchema = z.strictObject({
  sessionId: z.uuid(),
  utteranceId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  text: z
    .string()
    .min(1)
    .max(6000)
    .refine((value) => !!value.trim()),
  acknowledged: z.literal(true),
});
export const voiceControlSchema = z
  .strictObject({
    sessionId: z.uuid(),
    operation: z.enum(["stop", "text", "interrupt", "discard"]),
    utteranceId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      (value.operation === "discard") === (value.utteranceId !== undefined),
  );
export const voiceClipInput = z.strictObject({
  sessionId: z.uuid(),
  turnId: z.uuid(),
  expectedRevision: z.number().int().positive(),
});
export const voiceClipSchema = z.strictObject({
  id: z.string().max(100),
  nonce: z.uuid(),
  turnId: z.uuid(),
  sessionId: z.uuid(),
  reportId: z.uuid(),
  revision: z.number().int().positive(),
  agent: z.enum(["saathi", "drishti", "disha"]),
  speaker: z.enum(["priya", "shubh", "suhani"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  durationMs: z.number().positive().max(90000),
});
export type VoiceClip = z.infer<typeof voiceClipSchema>;
export const voicePlaybackSchema = z.strictObject({
  sessionId: z.uuid(),
  clipId: z.string().max(100),
  nonce: z.uuid(),
  operation: z.enum(["started", "ended"]),
});
