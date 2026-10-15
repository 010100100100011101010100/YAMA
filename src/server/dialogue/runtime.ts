import "server-only";
import { z } from "zod";
import { adapterSchema } from "@/lib/agent-task";
import { replySchema } from "@/lib/dialogue";
import type { Report } from "@/server/reports/domain";
import { ServiceError } from "@/server/errors";
import { runPrivateSnapshot } from "@/server/agents/runtime";
import type { DialogueRecord } from "./service";
import { CONNECTION_RECIPE, type ConnectionsResult } from "@/lib/connections";
import { requestedHandoff } from "@/lib/agent-addressing";

export type DialogueRunner = (report: Report, record: DialogueRecord, signal: AbortSignal, comparison?: ConnectionsResult) => Promise<unknown>;
export function dialogueContext(report: Report, record: DialogueRecord, comparison?: ConnectionsResult) {
  const turn = record.turn!;
  const context = { agent: turn.agent, language: turn.language, revision: report.revision, confirmed: report.confirmation?.revision === report.revision,
    automatic: record.automatic || !!requestedHandoff(turn.address, turn.agent, turn.depth), depth: turn.depth,
    visited: turn.visited ?? [],
    ...(turn.address ? { addressing: { kind: turn.address.kind, target: turn.address.target } } : {}),
    messages: report.messages.slice(-8).map(message => ({ text: message.text })),
    assertions: report.assertions.map(assertion => ({ field: assertion.field, value: assertion.value, originalValue: assertion.originalValue,
      included: assertion.included, polarity: assertion.polarity })),
    history: record.messages.slice(-6).map(message => ({ agent: message.agent, text: message.text, revision: message.revision })),
    ...(turn.agent === "drishti" ? { comparison: { status: comparison?.status ?? "unconfirmed", revision: report.revision, recipe: CONNECTION_RECIPE,
      candidates: comparison?.candidates.map(candidate => ({ title: candidate.title, shared: candidate.pattern.shared, different: candidate.pattern.different, differences: candidate.differences })) ?? [],
      blocked: comparison?.sources.filter(source => source.status !== "supporting").map(source => ({ pattern: source.value, status: source.status })) ?? [], linkage: "not_assessed" } } : {}),
  };
  if (JSON.stringify(context).length > 24000) throw new ServiceError(422, "context_limit");
  return context;
}
export const runDialogueSnapshot: DialogueRunner = async (report, record, signal, comparison) => {
  const adapter = record.turn!.adapter, context = dialogueContext(report, record, comparison);
  const raw = await runPrivateSnapshot("scripts.dialogue_snapshot", { context, adapter }, signal, adapter);
  const parsed = z.strictObject({ reply: replySchema, adapter: adapterSchema }).safeParse(raw);
  if (!parsed.success) {
    const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(raw);
    const code = failure.success ? failure.data.error.code : "invalid_model_output";
    throw new ServiceError(503, ["context_limit", "tool_timeout", "model_refused", "model_incomplete", "model_mismatch", "model_unavailable", "invalid_model_output", "provider_not_configured", "provider_config_changed", "monitor_not_configured"].includes(code) ? code : "dialogue_failed");
  }
  if (JSON.stringify(parsed.data.adapter) !== JSON.stringify(adapter)) throw new ServiceError(503, "provider_config_changed");
  return parsed.data.reply;
};
