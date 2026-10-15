import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
import type { EvidenceExtraction } from "@/lib/evidence-extraction";
import type { agentSourceSchema } from "@/lib/agent-task";
import type { voiceSourceSchema } from "@/lib/voice-source";

export const patternKeys = ["paid", "promised_delivery", "not_delivered", "no_reply"] as const;
const language = z.enum(["en", "hi", "hinglish"]);
const source = z.strictObject({ messageId: z.uuid(), start: z.number().int().min(0), end: z.number().int().positive() });
const polarity = z.enum(["affirmed", "contradicted", "uncertain"]);
const field = z.enum(["narrative", "amount", "item", "date", "pattern", "note"]);
const text = z.string().min(1).max(6000).refine(value => value.trim().length > 0);
export const createInput = z.strictObject({ synthetic: z.literal(true), language, narrative: text });
const proposal = z.strictObject({ field, value: text, polarity: polarity.default("affirmed"), source });
const correction = z.strictObject({
  operation: z.literal("correct_assertion"), expectedRevision: z.number().int().positive(), assertionId: z.uuid(),
  value: text.optional(), included: z.boolean().optional(), polarity: polarity.optional(),
}).refine(value => value.value !== undefined || value.included !== undefined || value.polarity !== undefined);
const revisionInput = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("add_message"), expectedRevision: z.number().int().positive(), text }),
  z.strictObject({ operation: z.literal("propose_assertions"), expectedRevision: z.number().int().positive(), proposals: z.array(proposal).min(1).max(20) }),
  correction,
]);
const confirmationInput = z.strictObject({ expectedRevision: z.number().int().positive(), acknowledged: z.literal(true) });

export type Assertion = {
  id: string; field: z.infer<typeof field>; value: string; originalValue: string; included: boolean;
  polarity: z.infer<typeof polarity>; source: z.infer<typeof source>; origin: "narration" | "client_proposal" | "evidence" | "agent_proposal"; verification: "not_verified";
  agentSource?: z.infer<typeof agentSourceSchema>;
};
export type Report = {
  _id: string; ownerId: string; schemaVersion: 1; synthetic: true; language: z.infer<typeof language>;
  creationKey: string; creationHash: string; revision: number;
  messages: { id: string; text: string; createdAt: Date; voiceSource?: z.infer<typeof voiceSourceSchema>; evidenceSource?: { evidenceId: string; sha256: string; name: string; extraction?: EvidenceExtraction } }[]; assertions: Assertion[];
  evidenceCount?: number;
  agentTaskCount?: number; agentTaskFence?: number;
  confirmation: { revision: number; confirmedAt: Date; kind: "user_confirmed" } | null;
  createdAt: Date; updatedAt: Date;
};

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ServiceError(400, "invalid_request");
  return parsed.data;
}
export function creationHash(input: z.infer<typeof createInput>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function narrationAssertion(message: Report["messages"][number]): Assertion {
  return { id: randomUUID(), field: "narrative", value: message.text, originalValue: message.text, included: true,
    polarity: "affirmed", origin: "narration", verification: "not_verified", source: { messageId: message.id, start: 0, end: message.text.length } };
}
export function createReport(ownerId: string, input: unknown, creationKey: string): Report {
  const parsed = parse(createInput, input);
  const now = new Date();
  const message = { id: randomUUID(), text: parsed.narrative, createdAt: now };
  return { _id: randomUUID(), ownerId, schemaVersion: 1, synthetic: true, language: parsed.language,
    creationKey, creationHash: creationHash(parsed), revision: 1, messages: [message], assertions: [narrationAssertion(message)],
    confirmation: null, createdAt: now, updatedAt: now };
}
function requireRevision(report: Report, expectedRevision: number) {
  if (report.revision !== expectedRevision) throw new ServiceError(409, "revision_conflict");
}
function validatePattern(assertion: Pick<Assertion, "field" | "value">) {
  if (assertion.field === "pattern" && !patternKeys.some(key => key === assertion.value)) throw new ServiceError(400, "unsupported_pattern");
}
export function reviseReport(report: Report, input: unknown): Report {
  const change = parse(revisionInput, input);
  requireRevision(report, change.expectedRevision);
  const next = structuredClone(report);
  if (change.operation === "add_message") {
    if (next.messages.length >= 50) throw new ServiceError(422, "report_limit");
    const message = { id: randomUUID(), text: change.text, createdAt: new Date() };
    next.messages.push(message);
    next.assertions.push(narrationAssertion(message));
  } else if (change.operation === "propose_assertions") {
    for (const proposed of change.proposals) {
      validatePattern(proposed);
      const message = next.messages.find(message => message.id === proposed.source.messageId);
      if (!message || proposed.source.end > message.text.length || proposed.source.start >= proposed.source.end) throw new ServiceError(400, "invalid_provenance");
      next.assertions.push({ ...proposed, id: randomUUID(), originalValue: proposed.value, included: true, origin: "client_proposal", verification: "not_verified" });
    }
  } else {
    const assertion = next.assertions.find(assertion => assertion.id === change.assertionId);
    if (!assertion) throw new ServiceError(404, "assertion_not_found");
    if (change.value !== undefined) assertion.value = change.value;
    if (change.included !== undefined) assertion.included = change.included;
    if (change.polarity !== undefined) assertion.polarity = change.polarity;
    validatePattern(assertion);
  }
  if (next.assertions.length > 100) throw new ServiceError(422, "report_limit");
  next.revision += 1;
  next.confirmation = null;
  next.updatedAt = new Date();
  return next;
}
export function confirmReport(report: Report, input: unknown): Report {
  const confirmation = parse(confirmationInput, input);
  requireRevision(report, confirmation.expectedRevision);
  if (report.confirmation?.revision === report.revision) return report;
  if (!report.assertions.some(assertion => assertion.included)) throw new ServiceError(422, "nothing_to_confirm");
  const now = new Date();
  return { ...report, confirmation: { revision: report.revision, confirmedAt: now, kind: "user_confirmed" }, updatedAt: now };
}
export function addEvidenceNote(report: Report, evidence: { evidenceId: string; sha256: string; name: string; text: string; extraction?: EvidenceExtraction }, expectedRevision: number): Report {
  requireRevision(report, expectedRevision);
  const value = parse(text, evidence.text);
  if (report.messages.length >= 50 || report.assertions.length >= 100) throw new ServiceError(422, "report_limit");
  const { text: original, ...evidenceSource } = evidence;
  const message = { id: randomUUID(), text: original, createdAt: new Date(), evidenceSource };
  const assertion: Assertion = { ...narrationAssertion(message), field: "note", origin: "evidence", value };
  return { ...report, messages: [...report.messages, message], assertions: [...report.assertions, assertion],
    revision: report.revision + 1, confirmation: null, updatedAt: new Date() };
}
export function matchingPatterns(report: Report): string[] {
  const included = report.assertions.filter(assertion => assertion.included && assertion.field === "pattern");
  return patternKeys.filter(key => included.some(assertion => assertion.value === key && assertion.polarity === "affirmed")
    && !included.some(assertion => assertion.value === key && assertion.polarity !== "affirmed"));
}
export function publicReport(report: Report) {
  const { ownerId, creationKey, creationHash, evidenceCount, agentTaskCount, agentTaskFence, ...visible } = report;
  void ownerId; void creationKey; void creationHash; void evidenceCount; void agentTaskCount; void agentTaskFence;
  return visible;
}
