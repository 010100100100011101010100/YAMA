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
import { hideReporterDetails } from "./privacy";
import type { DialoguePublicContext } from "@/lib/dialogue-sources";
import { candidateReviewSchema, type CandidateReview } from "@/lib/retrieval";

export type DialogueRunner = (report: Report, record: DialogueRecord, signal: AbortSignal, comparison?: ConnectionsResult, publicContext?: DialoguePublicContext, onText?: (text: string) => Promise<void>) => Promise<unknown>;
export type CandidateReviewer = (report: Report, record: DialogueRecord, comparison: ConnectionsResult, signal: AbortSignal) => Promise<unknown>;
export const runCandidateReviewSnapshot: CandidateReviewer = async (report, record, comparison, signal) => {
  if (!record.turn!.adapter.live) return { cases: comparison.candidates.map(candidate => ({ id: candidate.id, decision: candidate.identifiers?.length || candidate.pattern.shared.length ? "attach" : "omit", reason: candidate.identifiers?.length ? "A shared contact makes this report useful for comparison; identity remains unknown." : candidate.pattern.shared.length ? "The recorded sequence is useful to compare; it does not establish a shared person." : "This weak hint alone does not establish useful context." })).map((entry, index) => index >= 5 ? { ...entry, decision: "omit", reason: "Only five reports can be included in this reply." } : entry) };
  const context = { agent: record.turn!.agent, language: record.turn!.language, question: record.turn!.userPrompt?.text ?? "Compare the confirmed account with retrieved reports.",
    assertions: report.assertions.map(assertion => ({ value: assertion.value, included: assertion.included, polarity: assertion.polarity })),
    candidates: comparison.candidates.map(candidate => ({ id: candidate.id, title: candidate.title, summary: candidate.summary.slice(0, 600),
      sharedContacts: candidate.identifiers?.map(identifier => ({ kind: identifier.kind, value: identifier.value })) ?? [], sharedDetails: candidate.details ?? [], sharedPatterns: candidate.pattern.shared,
      ...(candidate.semantic ? { semantic: { basis: candidate.semantic.basis } } : {}),
      outcome: candidate.resolution ? { status: candidate.resolution.status, summary: candidate.resolution.summary.slice(0, 500) } : null })) };
  if (JSON.stringify(context).length > 24000) throw new ServiceError(422, "context_limit");
  const raw = await runPrivateSnapshot("scripts.dialogue_snapshot", { operation: "review", context, adapter: record.turn!.adapter }, signal, record.turn!.adapter);
  const parsed = z.strictObject({ review: candidateReviewSchema, adapter: adapterSchema }).safeParse(raw);
  if (!parsed.success || JSON.stringify(parsed.data.adapter) !== JSON.stringify(record.turn!.adapter)) throw new ServiceError(503, "invalid_candidate_review");
  return parsed.data.review;
};
export function reviewedComparison(comparison: ConnectionsResult, input: unknown): { comparison: ConnectionsResult; review: CandidateReview } {
  const parsed = candidateReviewSchema.safeParse(input);
  if (!parsed.success || parsed.data.cases.length !== comparison.candidates.length || new Set(parsed.data.cases.map(entry => entry.id)).size !== parsed.data.cases.length
    || parsed.data.cases.some(entry => !comparison.candidates.some(candidate => candidate.id === entry.id)) || parsed.data.cases.filter(entry => entry.decision === "attach").length > 5) throw new ServiceError(503, "invalid_candidate_review");
  const review = { cases: parsed.data.cases.map(entry => ({ ...entry, reason: hideReporterDetails(entry.reason, comparison.candidates.map(candidate => candidate.id)) })) };
  return { comparison: { ...comparison, candidates: comparison.candidates.filter(candidate => review.cases.some(entry => entry.id === candidate.id && entry.decision === "attach")) }, review };
}
export function dialogueContext(report: Report, record: DialogueRecord, comparison?: ConnectionsResult, publicContext?: DialoguePublicContext) {
  const turn = record.turn!;
  const context = { agent: turn.agent, language: turn.language, revision: report.revision, confirmed: report.confirmation?.revision === report.revision,
    intent: turn.userPrompt ? "question" : "account",
    automatic: record.automatic || !!requestedHandoff(turn.address, turn.agent, turn.depth), depth: turn.depth,
    visited: turn.visited ?? [],
    ...(turn.address ? { addressing: { kind: turn.address.kind, target: turn.address.target } } : {}),
    messages: [...report.messages.map(message => ({ text: message.text })), ...(turn.userPrompt ? [{ text: turn.userPrompt.text }] : [])].slice(-8),
    assertions: report.assertions.map(assertion => ({ field: assertion.field, value: assertion.value, originalValue: assertion.originalValue,
      included: assertion.included, polarity: assertion.polarity })),
    history: record.messages.slice(-6).map(message => ({ agent: message.agent, text: hideReporterDetails(message.text, message.connectionReceipt?.cases.map(reference => reference.id)), revision: message.revision,
      ...(message.userPrompt ? { userPrompt: message.userPrompt.text } : {}) })),
    ...(publicContext ? { publicContext: structuredClone(publicContext) } : {}),
    ...(["drishti", "disha"].includes(turn.agent) ? { comparison: { status: comparison?.status ?? "unconfirmed", revision: report.revision, recipe: CONNECTION_RECIPE,
      candidates: comparison?.candidates.slice(0, 5).map(candidate => ({ id: candidate.id, title: candidate.title, summary: candidate.summary.slice(0, 1000),
        ...(candidate.harmCategories ? { harmCategories: candidate.harmCategories } : {}),
        shared: candidate.pattern.shared, different: candidate.pattern.different, differences: candidate.differences,
        ...(candidate.identifiers ? { identifiers: candidate.identifiers } : {}),
        ...(candidate.details ? { details: candidate.details } : {}),
        ...(candidate.semantic ? { semantic: { basis: candidate.semantic.basis } } : {}),
        ...(candidate.resolution ? { resolution: candidate.resolution } : {}),
        ...(candidate.evidence ? { evidence: candidate.evidence } : {}),
      })) ?? [],
      blocked: comparison?.sources.filter(source => source.status !== "supporting").map(source => ({ pattern: source.value, status: source.status })) ?? [], linkage: "not_assessed" } } : {}),
  };
  // Generated history is not evidence. Shorten it before sacrificing fresh
  // source context; keep user questions and all reviewed corrections intact.
  for (const limit of [1000, 500, 150]) {
    if (JSON.stringify(context).length <= 24000) break;
    for (const message of context.history) if (message.text.length > limit) message.text = `${message.text.slice(0, limit)}…`;
  }
  for (const limit of [1000, 500, 0]) {
    if (JSON.stringify(context).length <= 24000) break;
    for (const source of context.publicContext?.sources ?? []) source.excerpt = source.excerpt.slice(0, limit);
  }
  // Trim retrieved prose first; keep every selected match, source quote, outcome and user correction.
  for (const limit of [600, 300, 100]) {
    if (JSON.stringify(context).length <= 24000) break;
    for (const candidate of context.comparison?.candidates ?? []) candidate.summary = candidate.summary.slice(0, limit);
  }
  if (JSON.stringify(context).length > 24000) throw new ServiceError(422, "context_limit");
  return context;
}
export const runDialogueSnapshot: DialogueRunner = async (report, record, signal, comparison, publicContext, onText) => {
  const adapter = record.turn!.adapter, context = dialogueContext(report, record, comparison, publicContext);
  const stream = !!onText && adapter.live;
  const raw = await runPrivateSnapshot("scripts.dialogue_snapshot", { context, adapter, ...(stream ? { stream: true } : {}) }, signal, adapter, stream ? onText : undefined);
  const parsed = z.strictObject({ reply: replySchema, adapter: adapterSchema }).safeParse(raw);
  if (!parsed.success) {
    const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(raw);
    const code = failure.success ? failure.data.error.code : "invalid_model_output";
    throw new ServiceError(503, ["context_limit", "tool_timeout", "model_refused", "model_incomplete", "model_mismatch", "model_unavailable", "invalid_model_output", "provider_not_configured", "provider_config_changed", "monitor_not_configured"].includes(code) ? code : "dialogue_failed");
  }
  if (JSON.stringify(parsed.data.adapter) !== JSON.stringify(adapter)) throw new ServiceError(503, "provider_config_changed");
  return parsed.data.reply;
};
