import { z } from "zod";
export const chatStatusSchema = z.object({
  reportId: z.uuid(),
  resolution: z.enum(["unresolved", "resolved"]),
  version: z.number().int().nonnegative(),
});
export const chatStatusCommand = z.strictObject({
  resolution: z.enum(["unresolved", "resolved"]),
  expectedVersion: z.number().int().nonnegative(),
});
export const chatSummarySchema = z.object({
  _id: z.uuid(),
  title: z.string().max(100),
  language: z.enum(["en", "hi", "hinglish"]),
  resolution: z.enum(["unresolved", "resolved"]),
  statusVersion: z.number().int().nonnegative(),
});
export type ChatStatus = z.infer<typeof chatStatusSchema>;
export type ChatSummary = z.infer<typeof chatSummarySchema>;
export type ChatResolution = ChatStatus["resolution"];
