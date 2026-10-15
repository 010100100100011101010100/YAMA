import "server-only";
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { ServiceError } from "@/server/errors";
import type { SpeechRunner } from "./service";
export function voiceEnvironment() {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    NODE_ENV: process.env.NODE_ENV,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
  };
  for (const key of [
    "YAMA_DEMO_ONLY",
    "YAMA_VOICE_LIVE_ENABLED",
    "YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED",
    "SARVAM_API_KEY",
  ])
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  return environment;
}
export function voicePython() {
  // Runtime-owned interpreter; keep external venv symlinks out of the app bundle.
  const python = process.env.YAMA_VOICE_PYTHON;
  if (!python || !isAbsolute(python))
    throw new ServiceError(503, "voice_runtime_unavailable");
  return python;
}
export const synthesizeSpeech: SpeechRunner = async (
  text,
  agent,
  language,
  signal,
) => {
  if (process.env.NODE_ENV === "test")
    throw new ServiceError(503, "live_provider_disabled_in_tests");
  const output = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(voicePython(), ["-m", "scripts.voice_synthesis"], {
      env: voiceEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0,
      failure: string | null = null;
    const stop = (code: string) => {
      failure ??= code;
      child.kill("SIGKILL");
    };
    const canceled = () => stop("speech_canceled");
    signal.addEventListener("abort", canceled, { once: true });
    if (signal.aborted) canceled();
    const timer = setTimeout(() => stop("speech_timeout"), 30000);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", canceled);
    };
    child.stderr.on("data", () => undefined);
    child.stdin.on("error", () => stop("speech_failed"));
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 3_000_044) stop("voice_audio_limit");
      else chunks.push(chunk);
    });
    child.once("error", () => {
      cleanup();
      reject(new ServiceError(503, "voice_runtime_unavailable"));
    });
    child.once("close", (code) => {
      cleanup();
      if (failure || code !== 0)
        reject(new ServiceError(503, failure ?? "speech_failed"));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(JSON.stringify({ text, agent, language }));
  });
  return output;
};
