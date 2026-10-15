import { describe, expect, it } from "vitest";
import { textAdapter, openAISettings } from "@/server/agents/config";
import { AGENT_ADAPTER, adapterSchema, agentSourceSchema } from "@/lib/agent-task";
import { resultHash, validateExtraction, acceptProposals } from "@/server/agents/domain";
import { createReport } from "@/server/reports/domain";
import { randomUUID } from "node:crypto";
import { runAgentSnapshot, snapshotEnvironment } from "@/server/agents/runtime";

const live = { YAMA_TEXT_PROVIDER: "openai", YAMA_MODEL_LIVE_ENABLED: "true", YAMA_DEMO_ONLY: "true",
  YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED: "true", OPENAI_API_KEY: "test-key", OPENAI_TEXT_MODEL: "test-model" };
describe("server-only provider selection", () => {
  it("refuses live network calls in the automated test runtime", async () => {
    const report = createReport("owner", { synthetic: true, language: "en", narrative: "Fictional." }, randomUUID());
    await expect(runAgentSnapshot(report, new AbortController().signal, textAdapter(live))).rejects.toThrow("live_provider_disabled_in_tests");
  });
  it("defaults to fixtures even when unrelated API keys exist", () => {
    expect(textAdapter({ OPENAI_API_KEY: "unused" })).toEqual(AGENT_ADAPTER);
  });
  it("never gives provider credentials, database credentials or proxy settings to fixture processes", () => {
    const isolated = snapshotEnvironment(AGENT_ADAPTER);
    expect(Object.keys(isolated).sort()).toEqual(["NODE_ENV", "PATH", "PYTHONDONTWRITEBYTECODE", "PYTHONIOENCODING", "PYTHONNOUSERSITE", "PYTHONUTF8"].sort());
  });
  it("requires explicit enablement, model, synthetic mode and data policy acknowledgement", () => {
    expect(textAdapter(live)).toEqual({ provider: "openai", model: "test-model", version: "1", live: true });
    for (const key of ["YAMA_MODEL_LIVE_ENABLED", "YAMA_DEMO_ONLY", "YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED", "OPENAI_API_KEY", "OPENAI_TEXT_MODEL"]) {
      expect(() => textAdapter({ ...live, [key]: "" })).toThrow("provider_not_configured");
    }
    expect(() => textAdapter({ YAMA_TEXT_PROVIDER: "unknown" })).toThrow();
  });
  it("bounds tokens/calls and rejects unapproved endpoints", () => {
    expect(openAISettings(live)).toMatchObject({ maxCalls: 20, maxOutputTokens: 4096, timeoutSeconds: 15, baseUrl: "https://api.openai.com/v1" });
    for (const change of [{ OPENAI_BASE_URL: "https://private.example/v1" }, { YAMA_OPENAI_MAX_CALLS: "101" },
      { YAMA_OPENAI_MAX_CALLS: "0" }, { YAMA_OPENAI_MAX_OUTPUT_TOKENS: "99999" }, { YAMA_OPENAI_TIMEOUT_SECONDS: "19" }]) {
      expect(() => openAISettings({ ...live, ...change })).toThrow();
    }
  });
  it("rejects misleading adapter combinations and preserves old fixture receipts", () => {
    expect(adapterSchema.parse(AGENT_ADAPTER)).toEqual(AGENT_ADAPTER);
    expect(adapterSchema.safeParse({ ...textAdapter(live), live: false }).success).toBe(false);
    expect(agentSourceSchema.safeParse({ taskId: randomUUID(), agent: "saathi", ...textAdapter(live) }).success).toBe(false);
  });
  it("binds provider identity to the receipt hash and accepted assertion provenance", () => {
    const report = createReport("owner", { synthetic: true, language: "en", narrative: "₹18,000" }, randomUUID());
    const extraction = validateExtraction(report, { proposals: [{ field: "amount", value: "₹18,000", quote: "₹18,000", polarity: "affirmed", source: { messageId: report.messages[0].id, start: 0, end: 7 } }], skippedExisting: 0 });
    const adapter = textAdapter(live);
    expect(resultHash(extraction, adapter)).not.toBe(resultHash(extraction));
    const accepted = acceptProposals(report, randomUUID(), extraction.proposals, 1, adapter);
    expect(accepted.assertions.at(-1)?.agentSource).toMatchObject({ provider: "openai", model: "test-model" });
    expect(accepted.confirmation).toBeNull();
  });
});
