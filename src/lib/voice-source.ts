import { z } from "zod";
export const voiceSourceSchema = z.strictObject({
  sessionId: z.uuid(),
  utteranceId: z.uuid(),
  rawTranscript: z.string().min(1).max(6000),
  model: z.literal("saaras:v4"),
  language: z.enum(["en", "hi", "hinglish"]),
});
