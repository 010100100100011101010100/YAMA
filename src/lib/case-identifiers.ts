import { z } from "zod";

export const harmCategorySchema = z.enum(["cybercrime", "bullying", "hate_speech", "terrorism", "fraud", "money_laundering", "sexual_molestation"]);
export const harmCategoriesSchema = z.array(harmCategorySchema).max(7).refine(values => new Set(values).size === values.length);
export type HarmCategory = z.infer<typeof harmCategorySchema>;

export const identifierKindSchema = z.enum(["phone", "email", "telegram"]);
export const contactSourceSchema = z.strictObject({ messageId: z.uuid(), start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(6000) });
export const caseResolutionSchema = z.strictObject({ status: z.enum(["resolved", "unresolved", "partially_resolved"]), summary: z.string().min(1).max(2000),
  verification: z.literal("synthetic_user_report"), actions: z.array(z.strictObject({ kind: z.string().min(1).max(100), description: z.string().min(1).max(1000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sourceMessageId: z.uuid() })).min(1).max(10) });
export const caseEvidenceSchema = z.strictObject({ id: z.uuid(), name: z.string().min(1).max(120), format: z.enum(["png", "text"]), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const caseMediaSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("image"), src: z.string().regex(/^\/media\/aliases\/[a-z0-9-]+\.png$/), caption: z.string().min(1).max(300), provenance: z.literal("illustration") }),
  z.strictObject({ kind: z.literal("video"), asset: z.literal("tracking-reconstruction"), sha256: z.string().regex(/^[a-f0-9]{64}$/), caption: z.string().min(1).max(300), provenance: z.literal("reconstruction") }),
]);
export const identifierSourceSchema = z.strictObject({ kind: identifierKindSchema, value: z.string().min(1).max(254), key: z.string().min(1).max(270),
  assertionId: z.uuid(), source: contactSourceSchema.omit({ quote: true }), quote: z.string().min(1).max(254),
  status: z.enum(["supporting", "excluded", "uncertain", "contradicted", "blocked"]), evidenceId: z.uuid().nullable() });
export type IdentifierSource = z.infer<typeof identifierSourceSchema>;
