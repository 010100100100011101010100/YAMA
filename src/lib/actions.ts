import { z } from "zod";
import { agentSourceSchema } from "./agent-task";
export const actionReviewInput = z.strictObject({ expectedRevision: z.number().int().positive(), receipt: z.string().regex(/^[a-f0-9]{64}$/), acknowledged: z.literal(true) });
export const actionFileSchema = z.strictObject({ id: z.uuid(), name: z.string().min(1).max(120), size: z.number().int().min(1).max(5242880), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), format: z.enum(["text", "pdf", "png", "jpeg"]),
  status: z.enum(["stored", "queued", "processing", "ready", "failed", "canceled"]), reviewed: z.boolean() });
export const actionPreviewSchema = z.strictObject({
  recipe: z.literal("private-actions-v1"), reportId: z.uuid(), revision: z.number().int().positive(), language: z.enum(["en", "hi", "hinglish"]),
  confirmation: z.enum(["user_confirmed", "unconfirmed"]), verification: z.literal("not_independently_verified"), submitted: z.literal(false),
  summary: z.array(z.strictObject({ id: z.uuid(), field: z.enum(["narrative", "amount", "item", "date", "pattern", "note"]), value: z.string().min(1).max(6000), originalValue: z.string().min(1).max(6000),
    polarity: z.enum(["affirmed", "contradicted", "uncertain"]), origin: z.enum(["narration", "client_proposal", "evidence", "agent_proposal"]), agentSource: agentSourceSchema.optional(),
    source: z.strictObject({ messageId: z.uuid(), start: z.number().int().min(0), end: z.number().int().positive() }), quote: z.string().min(1).max(6000),
    evidence: z.strictObject({ id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), textSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), available: z.boolean() }).nullable(),
  })).max(100), omittedAssertionIds: z.array(z.uuid()).max(100), files: z.array(actionFileSchema).max(20), receipt: z.string().regex(/^[a-f0-9]{64}$/),
  review: z.discriminatedUnion("status", [z.strictObject({ status: z.literal("unreviewed"), reviewedAt: z.null() }), z.strictObject({ status: z.literal("reviewed"), reviewedAt: z.iso.datetime() })]),
}).superRefine((preview, context) => {
  const ids = [...preview.summary.map(statement => statement.id), ...preview.omittedAssertionIds];
  if (new Set(ids).size !== ids.length || new Set(preview.files.map(file => file.id)).size !== preview.files.length
    || preview.summary.some(statement => statement.source.end - statement.source.start !== statement.quote.length || (statement.origin === "agent_proposal") !== !!statement.agentSource))
    context.addIssue({ code: "custom", message: "Invalid action provenance" });
});
export type ActionPreview = z.infer<typeof actionPreviewSchema>;
export type ActionFile = z.infer<typeof actionFileSchema>;
