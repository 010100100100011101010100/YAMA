import { z } from "zod";

export const detailKindSchema = z.enum(["item", "amount", "reported_alias"]);
export const retrievalDetailSchema = z.strictObject({ kind: detailKindSchema, key: z.string().min(1).max(270), value: z.string().min(1).max(254), quote: z.string().min(1).max(254) });
export type RetrievalDetail = z.infer<typeof retrievalDetailSchema>;
export const candidateReviewSchema = z.strictObject({ cases: z.array(z.strictObject({ id: z.string().min(1).max(100), decision: z.enum(["attach", "omit"]), reason: z.string().trim().min(1).max(300) })).max(10) });
export type CandidateReview = z.infer<typeof candidateReviewSchema>;
