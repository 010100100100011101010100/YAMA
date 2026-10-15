import { describe, expect, it } from "vitest";
import { RoomServiceClient } from "livekit-server-sdk";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { voiceToken, type VoiceSettings } from "@/server/voice/config";
process.loadEnvFile(".env.local");
describe("actual local LiveKit transport", () => {
  it("receives synthetic microphone frames through scoped SDK tokens, without a provider key", async () => {
    const settings: VoiceSettings = {
      url: "ws://127.0.0.1:7880",
      key: process.env.LIVEKIT_API_KEY!,
      secret: process.env.LIVEKIT_API_SECRET!,
      sarvamKey: "not-used",
      seconds: 120,
      maxSeconds: 300,
      maxCalls: 20,
    };
    const room = `yama-transport-test-${randomUUID()}`,
      identity = `participant-${randomUUID()}`;
    const service = new RoomServiceClient(
      "http://127.0.0.1:7880",
      settings.key,
      settings.secret,
    );
    try {
      await service.createRoom({
        name: room,
        maxParticipants: 2,
        emptyTimeout: 20,
      });
      const bindings = {
        url: settings.url,
        identity,
        clientToken: await voiceToken(settings, room, identity, false),
        workerToken: await voiceToken(
          settings,
          room,
          `worker-${randomUUID()}`,
          true,
        ),
      };
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          ".venv-voice/bin/python",
          ["-m", "scripts.voice_transport_probe"],
          {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
              NODE_ENV: "test",
              PATH: process.env.PATH,
              PYTHONDONTWRITEBYTECODE: "1",
              PYTHONUTF8: "1",
            },
          },
        );
        let content = "",
          lastPhase = "starting";
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Local voice transport timed out at ${lastPhase}`));
        }, 25000);
        child.stdout.on("data", (chunk) => {
          content += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          for (const line of String(chunk).split("\n")) {
            if (
              /^PHASE:(request-read|rooms-created|source-created|worker-joined|client-joined|published|received|cleanup-begin|cleanup-client|cleanup-worker|closed)$/.test(
                line.trim(),
              )
            )
              lastPhase = line.trim().slice(6);
          }
        });
        child.once("error", () => {
          clearTimeout(timer);
          reject(new Error("Local voice runtime unavailable"));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (code !== 0)
            reject(new Error(`Local voice transport failed at ${lastPhase}`));
          else resolve(content);
        });
        child.stdin.end(JSON.stringify(bindings));
      });
      expect(JSON.parse(output)).toEqual({
        connected: true,
        syntheticAudioReceived: true,
      });
    } finally {
      await service.deleteRoom(room);
    }
  }, 30000);
});
