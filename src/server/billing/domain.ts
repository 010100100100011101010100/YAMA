import "server-only";
import DodoPayments from "dodopayments";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
import type { BillingSettings } from "./config";
export const providerId = z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/);
export function validateCheckoutURL(value: string, sessionId: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError(503, "checkout_destination_rejected");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "test.checkout.dodopayments.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/session/${sessionId}`
  )
    throw new ServiceError(503, "checkout_destination_rejected");
  return url.href;
}
export const freeDetailCount = (total: number) => Math.ceil(total * 0.3);
export const paymentSnapshotSchema = z.strictObject({
  paymentId: providerId,
  businessId: providerId,
  purchaseId: z.uuid(),
  sessionId: providerId,
  status: z.enum([
    "succeeded",
    "failed",
    "cancelled",
    "processing",
    "requires_customer_action",
  ]),
  currency: z.string().length(3),
  amount: z.number().int().nonnegative(),
  cart: z
    .array(
      z.strictObject({
        product_id: providerId,
        quantity: z.number().int().positive(),
      }),
    )
    .max(20),
  refunded: z.boolean(),
  disputed: z.boolean(),
  subscription: z.boolean(),
});
export type PaymentSnapshot = z.infer<typeof paymentSnapshotSchema>;
export type BillingEvent = {
  type: string;
  paymentId: string;
  businessId: string;
};
export function verifiedBillingEvent(
  raw: string,
  headers: Record<string, string>,
  settings: BillingSettings,
): BillingEvent | null {
  let envelope: unknown;
  try {
    envelope = new DodoPayments({
      bearerToken: settings.apiKey || "fixture-no-provider-token",
      webhookKey: settings.webhookKey,
      environment: "test_mode",
      maxRetries: 0,
    }).webhooks.unwrap(raw, { headers });
  } catch {
    throw new ServiceError(401, "webhook_signature_invalid");
  }
  const header = z
    .object({ business_id: providerId, type: z.string().max(100) })
    .safeParse(envelope);
  if (!header.success) throw new ServiceError(400, "webhook_payload_invalid");
  if (header.data.business_id !== settings.businessId)
    throw new ServiceError(400, "webhook_business_mismatch");
  if (
    ![
      "payment.succeeded",
      "payment.failed",
      "payment.cancelled",
      "refund.succeeded",
      "dispute.opened",
      "dispute.accepted",
      "dispute.lost",
    ].includes(header.data.type)
  )
    return null;
  const parsed = z
    .object({
      business_id: providerId,
      type: z.string(),
      data: z.object({ payment_id: providerId }),
    })
    .safeParse(envelope);
  if (!parsed.success) throw new ServiceError(400, "webhook_payload_invalid");
  return {
    type: parsed.data.type,
    paymentId: parsed.data.data.payment_id,
    businessId: parsed.data.business_id,
  };
}
