import "server-only";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { AGENT_ADAPTER, type AgentAdapter } from "@/lib/agent-task";
import { ServiceError } from "@/server/errors";

type Environment = Record<string, string | undefined>;
function integer(env: Environment, key: string, fallback: number, minimum: number, maximum: number) {
  const value = env[key] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < minimum || Number(value) > maximum) throw new ServiceError(503, "provider_not_configured");
  return Number(value);
}
export function openAISettings(env: Environment = process.env) {
  const model = env.OPENAI_TEXT_MODEL ?? "", baseUrl = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  if (env.YAMA_TEXT_PROVIDER !== "openai" || env.YAMA_MODEL_LIVE_ENABLED !== "true" || env.YAMA_DEMO_ONLY !== "true"
      || env.YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED !== "true" || !env.OPENAI_API_KEY?.trim()
      || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model)
      || !["https://api.openai.com/v1", "https://in.api.openai.com/v1"].includes(baseUrl)) throw new ServiceError(503, "provider_not_configured");
  return { model, baseUrl, maxCalls: integer(env, "YAMA_OPENAI_MAX_CALLS", 20, 1, 100),
    maxOutputTokens: integer(env, "YAMA_OPENAI_MAX_OUTPUT_TOKENS", 4096, 256, 4096),
    timeoutSeconds: integer(env, "YAMA_OPENAI_TIMEOUT_SECONDS", 15, 1, 18) };
}
export function textAdapter(env: Environment = process.env): AgentAdapter {
  const provider = env.YAMA_TEXT_PROVIDER ?? "fixture";
  if (provider === "fixture") return { ...AGENT_ADAPTER };
  if (provider === "codex") {
    codexSettings(env);
    return { provider: "codex", model: "codex-session", version: "1", live: true };
  }
  if (provider !== "openai") throw new ServiceError(503, "provider_not_configured");
  return { provider: "openai", model: openAISettings(env).model, version: "1", live: true };
}
export function codexSettings(env: Environment = process.env) {
  const binary = env.YAMA_CODEX_BINARY || "codex";
  if (env.YAMA_TEXT_PROVIDER !== "codex" || env.YAMA_CODEX_ENABLED !== "true" || env.YAMA_DEMO_ONLY !== "true"
      || binary !== "codex" && (!isAbsolute(binary) || /[\r\n\0]/.test(binary))) throw new ServiceError(503, "provider_not_configured");
  return { binary, timeoutSeconds: integer(env, "YAMA_CODEX_TIMEOUT_SECONDS", 120, 1, 180),
    maxCalls: integer(env, "YAMA_CODEX_MAX_CALLS", 100, 1, 200) };
}
export function providerCallSettings(env: Environment = process.env) {
  return env.YAMA_TEXT_PROVIDER === "codex"
    ? { ...codexSettings(env), budget: "codex-synthetic-demo" as const }
    : { ...openAISettings(env), budget: "openai-synthetic-demo" as const };
}
export function executionConfigHash(env: Environment = process.env) {
  const { maxCalls, ...settings } = providerCallSettings(env); void maxCalls;
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}
