import "server-only";
import { createHash } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
const configuration = z.object({
  YAMA_DEMO_ONLY: z.literal("true"),
  YAMA_VOICE_LIVE_ENABLED: z.literal("true"),
  YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED: z.literal("true"),
  SARVAM_API_KEY: z.string().min(8),
  LIVEKIT_API_KEY: z.string().min(4),
  LIVEKIT_API_SECRET: z.string().min(32),
  LIVEKIT_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "ws:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      !!url.port &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  }),
  YAMA_VOICE_SESSION_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(180)
    .default(120),
  YAMA_VOICE_MAX_SECONDS: z.coerce
    .number()
    .int()
    .min(120)
    .max(600)
    .default(300),
  YAMA_VOICE_MAX_TTS_CALLS: z.coerce.number().int().min(1).max(50).default(20),
});
export function voiceSettings(
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.YAMA_VOICE_LIVE_ENABLED !== "true")
    throw new ServiceError(503, "voice_disabled");
  const parsed = configuration.safeParse(environment);
  if (!parsed.success) throw new ServiceError(503, "voice_not_configured");
  const value = parsed.data;
  return {
    url: value.LIVEKIT_URL,
    key: value.LIVEKIT_API_KEY,
    secret: value.LIVEKIT_API_SECRET,
    sarvamKey: value.SARVAM_API_KEY,
    seconds: value.YAMA_VOICE_SESSION_SECONDS,
    maxSeconds: value.YAMA_VOICE_MAX_SECONDS,
    maxCalls: value.YAMA_VOICE_MAX_TTS_CALLS,
  };
}
export type VoiceSettings = ReturnType<typeof voiceSettings>;
export const voiceConfigHash = (settings: VoiceSettings) =>
  createHash("sha256").update(JSON.stringify(settings)).digest("hex");
export const VOICE_SPEAKERS = {
  saathi: "priya",
  drishti: "shubh",
  disha: "suhani",
} as const;
export async function voiceToken(
  settings: VoiceSettings,
  room: string,
  identity: string,
  worker: boolean,
) {
  const token = new AccessToken(settings.key, settings.secret, {
    identity,
    ttl: 60,
  });
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: !worker,
    canPublishSources: worker ? [] : [TrackSource.MICROPHONE],
    canSubscribe: worker,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return token.toJwt();
}
