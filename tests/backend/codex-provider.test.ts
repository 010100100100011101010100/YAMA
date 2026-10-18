import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { adapterSchema, agentSourceSchema } from "@/lib/agent-task";
import { codexSettings, executionConfigHash, textAdapter } from "@/server/agents/config";
import { snapshotEnvironment } from "@/server/agents/runtime";

const configured = { YAMA_TEXT_PROVIDER: "codex", YAMA_DEMO_ONLY: "true", YAMA_CODEX_ENABLED: "true",
  YAMA_CODEX_BINARY: "/usr/local/bin/codex", YAMA_CODEX_TIMEOUT_SECONDS: "120", YAMA_CODEX_MAX_CALLS: "100" };
const adapter = { provider: "codex", model: "codex-session", version: "1", live: true } as const;
afterEach(() => vi.unstubAllEnvs());

describe("signed-in Codex text provider", () => {
  it("requires an explicit synthetic demo opt-in without requiring an OpenAI API key", () => {
    expect(textAdapter(configured)).toEqual(adapter);
    expect(codexSettings(configured)).toMatchObject({ binary: "/usr/local/bin/codex", timeoutSeconds: 120, maxCalls: 100 });
    for (const name of ["YAMA_CODEX_ENABLED", "YAMA_DEMO_ONLY"]) {
      expect(() => textAdapter({ ...configured, [name]: "false" })).toThrow("provider_not_configured");
    }
    expect(() => codexSettings({ ...configured, YAMA_TEXT_PROVIDER: "openai" })).toThrow("provider_not_configured");
  });
  it("bounds account usage and process time and refuses ambiguous executables", () => {
    for (const change of [{ YAMA_CODEX_TIMEOUT_SECONDS: "181" }, { YAMA_CODEX_TIMEOUT_SECONDS: "0" },
      { YAMA_CODEX_MAX_CALLS: "201" }, { YAMA_CODEX_MAX_CALLS: "0" }, { YAMA_CODEX_BINARY: "./codex" }, { YAMA_CODEX_BINARY: "codex --unsafe" }]) {
      expect(() => codexSettings({ ...configured, ...change })).toThrow("provider_not_configured");
    }
    expect(codexSettings({ ...configured, YAMA_CODEX_BINARY: undefined }).binary).toBe("codex");
  });
  it("records honest provider provenance and never calls it fixture output", () => {
    expect(adapterSchema.parse(adapter)).toEqual(adapter);
    expect(adapterSchema.safeParse({ ...adapter, live: false }).success).toBe(false);
    expect(agentSourceSchema.parse({ taskId: randomUUID(), agent: "saathi", provider: "codex", model: "codex-session", version: "1" }).provider).toBe("codex");
  });
  it("passes only the Codex auth location and explicit controls, never application/API secrets", () => {
    for (const [name, value] of Object.entries({ ...configured, HOME: "/tmp/codex-test-home", CODEX_HOME: "/tmp/codex-test-home/.codex",
      OPENAI_API_KEY: "never-forward", SARVAM_API_KEY: "never-forward", LANGFUSE_SECRET_KEY: "never-forward",
      MONGODB_URI: "never-forward", GMAIL_APP_PASSWORD: "never-forward", HTTPS_PROXY: "never-forward" })) vi.stubEnv(name, value);
    const environment = snapshotEnvironment(adapter);
    expect(environment).toMatchObject({ HOME: "/tmp/codex-test-home", CODEX_HOME: "/tmp/codex-test-home/.codex", YAMA_TEXT_PROVIDER: "codex", YAMA_CODEX_ENABLED: "true" });
    for (const name of ["OPENAI_API_KEY", "SARVAM_API_KEY", "LANGFUSE_SECRET_KEY", "MONGODB_URI", "GMAIL_APP_PASSWORD", "HTTPS_PROXY"]) expect(environment).not.toHaveProperty(name);
  });
  it("binds executable and timeout changes to queued work without including account secrets", () => {
    for (const [name, value] of Object.entries(configured)) vi.stubEnv(name, value);
    const initial = executionConfigHash();
    vi.stubEnv("YAMA_CODEX_MAX_CALLS", "101");
    vi.stubEnv("OPENAI_API_KEY", "not-used");
    expect(executionConfigHash()).toBe(initial);
    vi.stubEnv("YAMA_CODEX_TIMEOUT_SECONDS", "150");
    expect(executionConfigHash()).not.toBe(initial);
  });
});
