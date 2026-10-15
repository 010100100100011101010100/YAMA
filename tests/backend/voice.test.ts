import { describe, expect, it } from "vitest";
import { voiceSettings, voiceToken } from "@/server/voice/config";
import { TokenVerifier } from "livekit-server-sdk";
import { inspectVoiceWave } from "@/server/voice/audio";
const environment = {
  YAMA_DEMO_ONLY: "true",
  YAMA_VOICE_LIVE_ENABLED: "true",
  YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED: "true",
  SARVAM_API_KEY: "test-only-key",
  LIVEKIT_URL: "ws://127.0.0.1:7880",
  LIVEKIT_API_KEY: "test-voice",
  LIVEKIT_API_SECRET: "a".repeat(64),
};
describe("bounded voice configuration", () => {
  it("requires explicit synthetic, provider/privacy configuration and a local transport", () => {
    expect(() => voiceSettings({})).toThrow("voice_disabled");
    for (const change of [
      { YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED: "false" },
      { SARVAM_API_KEY: "" },
      { LIVEKIT_URL: "wss://cloud.example.com" },
    ])
      expect(() => voiceSettings({ ...environment, ...change })).toThrow();
    expect(voiceSettings(environment)).toMatchObject({
      seconds: 120,
      maxSeconds: 300,
      maxCalls: 20,
    });
  });
  it("issues microphone-only room tokens without owner/report data or administrative permissions", async () => {
    const config = voiceSettings(environment);
    const token = await voiceToken(
      config,
      "yama-voice-random",
      "participant-random",
      false,
    );
    const claims = await new TokenVerifier(config.key, config.secret).verify(
      token,
    );
    expect(claims.video).toMatchObject({
      room: "yama-voice-random",
      roomJoin: true,
      canPublishSources: ["microphone"],
      canSubscribe: false,
      canPublishData: false,
    });
    expect(claims.video?.roomAdmin).not.toBe(true);
    expect(claims.metadata).toBeUndefined();
  });
  it("rejects invalid wave files before browser playback", () => {
    expect(() => inspectVoiceWave(Buffer.from("not audio"))).toThrow(
      "invalid_voice_audio",
    );
  });
});
