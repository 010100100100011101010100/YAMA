import { z } from "zod";
export const BILLING_OFFER = {
  id: "intelligence-ten-v1",
  amount: 1000,
  currency: "USD",
  credits: 10,
  testOnly: true,
} as const;
export const checkoutCommand = z.strictObject({
  key: z.uuid(),
  acknowledged: z.literal(true),
});
export const checkoutViewSchema = z.strictObject({
  id: z.uuid(),
  provider: z.enum(["fixture", "dodo_test"]),
  testOnly: z.literal(true),
  offer: z.literal(BILLING_OFFER.id),
  amount: z.literal(1000),
  currency: z.literal("USD"),
  credits: z.literal(10),
  status: z.enum([
    "creating",
    "ready",
    "creation_unknown",
    "failed",
    "paid",
    "reversed",
    "expired",
  ]),
  url: z.url().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  errorCode: z.string().nullable(),
});
export type CheckoutView = z.infer<typeof checkoutViewSchema>;
export const detailCommand = z.strictObject({
  key: z.uuid(),
  expectedRevision: z.number().int().positive(),
  receipt: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
});
export const detailSchema = z.strictObject({
  id: z.uuid(),
  ordinal: z.number().int().min(0).max(19),
  title: z.string().max(200),
  body: z.string().max(4000),
  kind: z.literal("authored_entitlement_fixture"),
  sensitive: z.literal(false),
  source: z.strictObject({
    caseId: z.string().regex(/^synthetic-[a-z0-9-]+$/),
    version: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});
export type AdvancedDetail = z.infer<typeof detailSchema>;
