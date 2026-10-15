import { z } from "zod";
export const notificationContentSchema = z.strictObject({
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  html: z.string().min(1).max(8000),
});
export const notificationApprovalSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  receipt: z.string().regex(/^[a-f0-9]{64}$/),
  key: z.uuid(),
  acknowledged: z.literal(true),
  allowFallback: z.boolean(),
});
export const notificationViewSchema = z.strictObject({
  id: z.uuid(),
  reportId: z.uuid(),
  revision: z.number().int().positive(),
  template: z.literal("workspace-link-v1"),
  language: z.enum(["en", "hi", "hinglish"]),
  recipient: z.strictObject({
    id: z.uuid(),
    address: z.email(),
    verification: z.enum(["fixture", "operator_confirmed_synthetic"]),
  }),
  from: z.email(),
  replyTo: z.email().nullable(),
  fallbackFrom: z.email().nullable(),
  content: notificationContentSchema,
  receipt: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(),
  approvedAt: z.iso.datetime().nullable(),
  status: z.enum([
    "draft",
    "queued",
    "dispatching",
    "captured",
    "accepted",
    "failed",
    "delivery_unknown",
    "canceled",
    "stale",
    "expired",
  ]),
  provider: z.enum(["fixture", "resend", "gmail"]),
  attempts: z.number().int().min(0).max(2),
  cancellationRequested: z.boolean(),
  deliveryConfirmed: z.literal(false),
  errorCode: z.string().nullable(),
  providerRef: z.string().max(128).nullable(),
});
export type NotificationView = z.infer<typeof notificationViewSchema>;
export type NotificationApproval = z.infer<typeof notificationApprovalSchema>;
export type NotificationContent = z.infer<typeof notificationContentSchema>;
