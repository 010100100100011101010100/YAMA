import { z } from "zod";
import { agentSourceSchema } from "./agent-task";

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
  candidates: z.array(z.strictObject({ id: z.string().min(1).max(100), title: z.string().max(500), summary: z.string().max(6000), synthetic: z.literal(true),
    pattern: z.strictObject({ shared: z.array(patternSchema).min(1).max(4), different: z.array(patternSchema).max(4), basis: z.literal("confirmed_pattern_tags") }),
    linkage: z.strictObject({ status: z.literal("not_assessed"), explanation: z.string().max(1000) }), differences: z.array(z.string().max(1000)),
    explanation: z.strictObject({ catalogueVersion: z.string().regex(/^[a-f0-9]{64}$/), sourceKind: z.literal("authored_synthetic"),
      paths: z.array(z.strictObject({ pattern: patternSchema, assertionIds: z.array(z.uuid()).min(1).max(100) })).min(1).max(4) }),
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
    const keys = candidate.explanation.paths.map(path => path.pattern);
    if (new Set(keys).size !== keys.length || keys.length !== candidate.pattern.shared.length || keys.some(key => !candidate.pattern.shared.includes(key))
        || candidate.explanation.paths.some(path => new Set(path.assertionIds).size !== path.assertionIds.length || path.assertionIds.some(id => {
          const source = sources.get(id); return !source || source.status !== "supporting" || source.value !== path.pattern;
        }))) context.addIssue({ code: "custom", message: "Invalid connection path" });
  }
});
export type ConnectionsResult = z.infer<typeof connectionsSchema>;
export type PatternSource = ConnectionsResult["sources"][number];
