import { z } from "zod";
import { adapterSchema } from "./agent-task";
import { connectionReceiptSchema } from "./connections";

export const agentIdSchema = z.enum(["saathi", "drishti", "disha"]);
const languageSchema = z.enum(["en", "hi", "hinglish"]);
export const replySchema = z.strictObject({ text: z.string().trim().min(1).max(4000), handoff: z.strictObject({
  target: agentIdSchema, reason: z.enum(["clarification", "similar_cases", "next_actions", "user_goal"]),
}).nullable() });
export type DialogueReply = z.infer<typeof replySchema>;
const entrySchema = z.strictObject({ id: z.uuid(), agent: agentIdSchema, revision: z.number().int().positive(),
  messageId: z.uuid(), text: z.string().min(1).max(4000), handoff:replySchema.shape.handoff.optional(), adapter: adapterSchema, language: z.enum(["en", "hi", "hinglish"]), connectionReceipt: connectionReceiptSchema.optional() });
export const dialogueSchema = z.strictObject({ reportId: z.uuid(), version: z.number().int().nonnegative(),
  activeAgent: agentIdSchema, automatic: z.boolean(), language: languageSchema, messages: z.array(entrySchema).max(60),
  voiceSessionId: z.uuid().optional(),
  turn: z.strictObject({ id: z.uuid(), agent: agentIdSchema, revision: z.number().int().positive(), messageId: z.uuid(),
    status: z.enum(["queued", "running", "ready", "delivered", "failed", "canceled", "stale"]),
    adapter: adapterSchema, reply: replySchema.nullable(), errorCode: z.string().nullable(), language: z.enum(["en", "hi", "hinglish"]),
    connectionReceipt: connectionReceiptSchema.optional(),
  }).nullable(),
});
export type Dialogue = z.infer<typeof dialogueSchema>;
const expected = { expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().nonnegative() };
export const dialogueCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...expected, operation: z.literal("reply"), key: z.uuid(), messageId: z.uuid(), agent: agentIdSchema, automatic: z.boolean(), language: languageSchema }),
  z.strictObject({ ...expected, operation: z.literal("delivered"), turnId: z.uuid() }),
  z.strictObject({ ...expected, operation: z.literal("select"), agent: agentIdSchema }),
  z.strictObject({ ...expected, operation: z.literal("automatic"), enabled: z.boolean() }),
  z.strictObject({ ...expected, operation: z.literal("language"), language: languageSchema }),
  z.strictObject({ ...expected, operation: z.literal("stop") }),
]);
export type DialogueCommand = z.infer<typeof dialogueCommandSchema>;
export function validateReply(reply: unknown, agent: Dialogue["activeAgent"], automatic: boolean, depth: number) {
  const parsed = replySchema.safeParse(reply);
  if (!parsed.success || parsed.data.handoff && (!automatic || depth >= 2 || parsed.data.handoff.target === agent)) return null;
  return parsed.data;
}
