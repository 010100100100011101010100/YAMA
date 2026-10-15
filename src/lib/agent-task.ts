import { z } from "zod";

export const AGENT_ADAPTER = { provider: "fixture", model: "authored-incident-v1", version: "1", live: false } as const;
const source = z.strictObject({ messageId: z.uuid(), start: z.number().int().min(0), end: z.number().int().positive() });
export const proposalSchema = z.strictObject({ field: z.enum(["narrative", "amount", "item", "date", "pattern", "note"]),
  value: z.string().min(1).max(6000), polarity: z.enum(["affirmed", "contradicted", "uncertain"]), source, quote: z.string().min(1).max(6000) });
export const extractionSchema = z.strictObject({ proposals: z.array(proposalSchema).max(20), skippedExisting: z.number().int().min(0).max(1000) });
export const extractionResultSchema = z.strictObject({ proposals: z.array(proposalSchema.extend({ id: z.uuid() })).max(20), skippedExisting: z.number().int().min(0).max(1000) });
const modelName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/);
export const adapterSchema = z.discriminatedUnion("provider", [
  z.strictObject({ provider: z.literal("fixture"), model: z.literal("authored-incident-v1"), version: z.literal("1"), live: z.literal(false) }),
  z.strictObject({ provider: z.literal("openai"), model: modelName, version: z.literal("1"), live: z.literal(true) }),
]);
export const agentSourceSchema = z.discriminatedUnion("provider", [
  z.strictObject({ taskId: z.uuid(), agent: z.literal("saathi"), provider: z.literal("fixture"), model: z.literal("authored-incident-v1"), version: z.literal("1") }),
  z.strictObject({ taskId: z.uuid(), agent: z.literal("saathi"), provider: z.literal("openai"), model: modelName, version: z.literal("1") }),
]);
export type AgentAdapter = z.infer<typeof adapterSchema>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const agentTaskSchema = z.object({ id: z.uuid(), reportId: z.uuid(), revision: z.number().int().positive(), agent: z.literal("saathi"), tool: z.literal("propose_draft_assertions"),
  status: z.enum(["queued", "running", "ready", "failed", "canceled", "stale", "accepted"]), attempts: z.number().int().min(0).max(4),
  adapter: adapterSchema, result: extractionResultSchema.nullable(), resultHash: hash.nullable(), errorCode: z.string().max(100).nullable(),
  accepted: z.object({ revision: z.number().int().positive(), proposalIds: z.array(z.uuid()).min(1).max(20), assertionIds: z.array(z.uuid()).min(1).max(20) }).nullable(),
}).superRefine((task, context) => {
  const hasResult = task.status === "ready" || task.status === "accepted";
  if (hasResult !== (task.result !== null && task.resultHash !== null) || !hasResult && (task.result || task.resultHash)
      || (task.status === "accepted") !== (task.accepted !== null)
      || task.result && new Set(task.result.proposals.map(proposal => proposal.id)).size !== task.result.proposals.length) {
    context.addIssue({ code: "custom", message: "Inconsistent task receipt" });
  }
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type AgentProposal = ExtractionResult["proposals"][number];
export type AgentTask = z.infer<typeof agentTaskSchema>;
