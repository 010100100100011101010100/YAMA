import { z } from "zod";

export const dialogueSourceSchema = z.strictObject({ url: z.url().max(1000), title: z.string().min(1).max(200), publisher: z.string().min(1).max(100),
  retrievedAt: z.iso.datetime(), excerpt: z.string().max(2000), bodyRead: z.boolean(), live: z.boolean() });
export const dialoguePublicContextSchema = z.strictObject({ status: z.enum(["ready", "unavailable"]), sources: z.array(dialogueSourceSchema).max(3) });
export type DialoguePublicContext = z.infer<typeof dialoguePublicContextSchema>;
