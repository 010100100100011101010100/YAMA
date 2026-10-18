import { z } from "zod";
import { adapterSchema } from "./agent-task";
import { connectionReceiptSchema } from "./connections";
import { dialoguePublicContextSchema } from "./dialogue-sources";

export const agentIdSchema = z.enum(["saathi", "drishti", "disha"]);
const languageSchema = z.enum(["en", "hi", "hinglish"]);
export const dialogueQuestionSchema = z.strictObject({ kind: z.enum(["choice", "text"]), prompt: z.string().trim().min(1).max(180),
  options: z.array(z.string().trim().min(1).max(120)).max(5), placeholder: z.string().max(120).nullable() }).superRefine((question, context) => {
  if (question.kind === "choice" && (question.options.length < 2 || new Set(question.options).size !== question.options.length)
    || question.kind === "text" && question.options.length !== 0) context.addIssue({ code: "custom", message: "Invalid question options" });
});
export type DialogueQuestion = z.infer<typeof dialogueQuestionSchema>;
export const replySchema = z.strictObject({ text: z.string().trim().min(1).max(4000), handoff: z.strictObject({
  target: agentIdSchema, reason: z.enum(["clarification", "similar_cases", "next_actions", "user_goal"]),
}).nullable(), question: dialogueQuestionSchema.nullable().optional() });
export type DialogueReply = z.infer<typeof replySchema>;
const userPromptSchema = z.strictObject({ id: z.uuid(), text: z.string().trim().min(1).max(1000) });
const entrySchema = z.strictObject({ id: z.uuid(), agent: agentIdSchema, revision: z.number().int().positive(),
  userPrompt: userPromptSchema.optional(),
  messageId: z.uuid(), text: z.string().min(1).max(4000), handoff:replySchema.shape.handoff.optional(), question: dialogueQuestionSchema.nullable().optional(), publicContext: dialoguePublicContextSchema.optional(), adapter: adapterSchema, language: z.enum(["en", "hi", "hinglish"]), connectionReceipt: connectionReceiptSchema.optional() });
export const dialogueSchema = z.strictObject({ reportId: z.uuid(), version: z.number().int().nonnegative(),
  activeAgent: agentIdSchema, automatic: z.boolean(), language: languageSchema, messages: z.array(entrySchema).max(60),
  voiceSessionId: z.uuid().optional(),
  turn: z.strictObject({ id: z.uuid(), agent: agentIdSchema, revision: z.number().int().positive(), messageId: z.uuid(),
    userPrompt: userPromptSchema.optional(),
    status: z.enum(["queued", "running", "ready", "delivered", "failed", "canceled", "stale"]),
    adapter: adapterSchema, reply: replySchema.nullable(), errorCode: z.string().nullable(), language: z.enum(["en", "hi", "hinglish"]),
    connectionReceipt: connectionReceiptSchema.optional(),
    publicContext: dialoguePublicContextSchema.optional(),
    preview: z.strictObject({ text: z.string().max(4000), sequence: z.number().int().positive() }).optional(),
    streamed: z.boolean().optional(),
  }).nullable(),
});
export type Dialogue = z.infer<typeof dialogueSchema>;
const expected = { expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().nonnegative() };
export const dialogueCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...expected, operation: z.literal("reply"), key: z.uuid(), messageId: z.uuid(), agent: agentIdSchema, automatic: z.boolean(), language: languageSchema, userPrompt: z.string().trim().min(1).max(1000).optional() }),
  z.strictObject({ ...expected, operation: z.literal("delivered"), turnId: z.uuid() }),
  z.strictObject({ ...expected, operation: z.literal("select"), agent: agentIdSchema }),
  z.strictObject({ ...expected, operation: z.literal("automatic"), enabled: z.boolean() }),
  z.strictObject({ ...expected, operation: z.literal("language"), language: languageSchema }),
  z.strictObject({ ...expected, operation: z.literal("stop") }),
]);
export type DialogueCommand = z.infer<typeof dialogueCommandSchema>;
export function validateReply(reply: unknown, agent: Dialogue["activeAgent"], automatic: boolean, depth: number) {
  const parsed = replySchema.safeParse(reply);
  if (!parsed.success || parsed.data.handoff && (!automatic || depth >= 2 || parsed.data.handoff.target === agent || parsed.data.question)) return null;
  return parsed.data;
}
