import "server-only";
import { createHash } from "node:crypto";
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
  if (provider !== "openai") throw new ServiceError(503, "provider_not_configured");
  return { provider: "openai", model: openAISettings(env).model, version: "1", live: true };
}
export function executionConfigHash(env: Environment = process.env) {
  const { maxCalls, ...settings } = openAISettings(env); void maxCalls;
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}
