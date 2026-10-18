import { z } from "zod";
import { agentSourceSchema } from "./agent-task";
import { caseResolutionSchema, caseEvidenceSchema, caseMediaSchema, identifierKindSchema, contactSourceSchema, identifierSourceSchema, harmCategoriesSchema } from "./case-identifiers";
import { retrievalDetailSchema } from "./retrieval";

export const CONNECTION_RECIPE = "confirmed-pattern-sources-v1" as const;
export const patternSchema = z.enum(["paid", "promised_delivery", "not_delivered", "no_reply"]);
export const connectionReceiptSchema = z.strictObject({ recipe: z.literal(CONNECTION_RECIPE), revision: z.number().int().positive(),
  cases: z.array(z.strictObject({ id: z.string().min(1).max(100), version: z.string().regex(/^[a-f0-9]{64}$/) })).max(10) });
export type ConnectionReceipt = z.infer<typeof connectionReceiptSchema>;
const patternSource = z.strictObject({ assertionId: z.uuid(), value: patternSchema, originalValue: patternSchema, corrected: z.boolean(),
  origin: z.enum(["narration", "client_proposal", "evidence", "agent_proposal"]), agentSource: agentSourceSchema.optional(),
  included: z.boolean(), polarity: z.enum(["affirmed", "contradicted", "uncertain"]),
  status: z.enum(["supporting", "blocked", "excluded", "contradicted", "uncertain"]), verification: z.literal("not_verified"),
  quote: z.string().min(1).max(6000), source: z.strictObject({ messageId: z.uuid(), start: z.number().int().min(0), end: z.number().int().positive() }),
  evidence: z.strictObject({ id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), textSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable() }).nullable(),
});
export const connectionsSchema = z.strictObject({ status: z.enum(["pending", "ready"]), reportId: z.uuid(), revision: z.number().int().positive(),
  recipe: z.literal(CONNECTION_RECIPE), sources: z.array(patternSource).max(100),
  identifierSources: z.array(identifierSourceSchema).max(100).optional(),
  candidates: z.array(z.strictObject({ id: z.string().min(1).max(100), title: z.string().max(500), summary: z.string().max(6000), synthetic: z.literal(true),
    harmCategories: harmCategoriesSchema.optional(),
    details: z.array(retrievalDetailSchema.extend({ catalogueQuote: z.string().min(1).max(254) })).max(50).optional(),
    semantic: z.strictObject({ basis: z.literal("narrative_similarity"), query: z.string().min(1).max(6000), quote: z.string().min(1).max(6000) }).optional(),
    pattern: z.strictObject({ shared: z.array(patternSchema).max(4), different: z.array(patternSchema).max(4), basis: z.literal("confirmed_pattern_tags") }),
    identifiers: z.array(z.strictObject({ kind: identifierKindSchema, value: z.string().min(1).max(254), assertionIds: z.array(z.uuid()).min(1).max(100),
      quote: z.string().min(1).max(254), source: contactSourceSchema.omit({ quote: true }), catalogueSource: contactSourceSchema })).max(20).optional(),
    resolution: caseResolutionSchema.optional(), evidence: z.array(caseEvidenceSchema).max(20).optional(),
    media: z.array(caseMediaSchema).max(3).optional(),
    linkage: z.strictObject({ status: z.enum(["not_assessed", "possible_shared_identifier"]), explanation: z.string().max(1000) }), differences: z.array(z.string().max(1000)),
    explanation: z.strictObject({ catalogueVersion: z.string().regex(/^[a-f0-9]{64}$/), sourceKind: z.literal("authored_synthetic"),
      paths: z.array(z.strictObject({ pattern: patternSchema, assertionIds: z.array(z.uuid()).min(1).max(100) })).max(4) }),
  })).max(10),
}).superRefine((result, context) => {
  const sources = new Map(result.sources.map(source => [source.assertionId, source]));
  if (sources.size !== result.sources.length || new Set(result.candidates.map(candidate => candidate.id)).size !== result.candidates.length
      || result.status === "pending" && (result.sources.length || result.candidates.length)
      || result.sources.some(source => source.source.end <= source.source.start || source.quote.length !== source.source.end - source.source.start
        || source.corrected !== (source.value !== source.originalValue)
        || (source.origin === "agent_proposal") !== (source.agentSource !== undefined)
        || source.status !== (!source.included ? "excluded" : source.polarity !== "affirmed" ? source.polarity : result.sources.some(other => other.value === source.value && other.included && other.polarity !== "affirmed") ? "blocked" : "supporting")))
    context.addIssue({ code: "custom", message: "Invalid connection sources" });
  for (const candidate of result.candidates) {
    if (!candidate.pattern.shared.length && !candidate.identifiers?.length && !candidate.details?.length && !candidate.semantic) context.addIssue({ code: "custom", message: "Missing connection basis" });
    if ((candidate.linkage.status === "possible_shared_identifier") !== !!candidate.identifiers?.length) context.addIssue({ code: "custom", message: "Invalid identifier linkage" });
    for (const identifier of candidate.identifiers ?? []) {
      if (identifier.source.end - identifier.source.start !== identifier.quote.length || identifier.catalogueSource.end - identifier.catalogueSource.start !== identifier.catalogueSource.quote.length
        || identifier.assertionIds.some(id => !result.identifierSources?.some(source => source.assertionId === id && source.status === "supporting" && source.kind === identifier.kind && source.value === identifier.value))) context.addIssue({ code: "custom", message: "Invalid identifier source" });
    }
    const keys = candidate.explanation.paths.map(path => path.pattern);
    if (new Set(keys).size !== keys.length || keys.length !== candidate.pattern.shared.length || keys.some(key => !candidate.pattern.shared.includes(key))
        || candidate.explanation.paths.some(path => new Set(path.assertionIds).size !== path.assertionIds.length || path.assertionIds.some(id => {
          const source = sources.get(id); return !source || source.status !== "supporting" || source.value !== path.pattern;
        }))) context.addIssue({ code: "custom", message: "Invalid connection path" });
  }
});
export type ConnectionsResult = z.infer<typeof connectionsSchema>;
export type PatternSource = ConnectionsResult["sources"][number];
