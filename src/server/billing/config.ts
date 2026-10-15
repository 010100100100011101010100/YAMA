import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
const ephemeralFixtureKey = "whsec_" + randomBytes(32).toString("base64");
export function billingSettings(
  environment: Record<string, string | undefined> = process.env,
) {
  const parsed = z
    .object({
      YAMA_DEMO_ONLY: z.literal("true"),
      YAMA_BILLING_PROVIDER: z
        .enum(["fixture", "dodo_test"])
        .default("fixture"),
      YAMA_BILLING_MAX_API_CALLS: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50),
    })
    .safeParse(environment);
  if (!parsed.success) throw new ServiceError(503, "billing_not_configured");
  const scope = parsed.data.YAMA_BILLING_PROVIDER;
  if (
    scope === "dodo_test" &&
    (environment.YAMA_DODO_TEST_ENABLED !== "true" ||
      environment.YAMA_DODO_DATA_POLICY_ACKNOWLEDGED !== "true" ||
      (environment.DODO_PAYMENTS_API_KEY?.trim().length ?? 0) < 8 ||
      !/^pdt_[a-zA-Z0-9_-]{1,100}$/.test(
        environment.DODO_PAYMENTS_PRODUCT_ID ?? "",
      ) ||
      !/^[a-zA-Z0-9_-]{3,150}$/.test(
        environment.DODO_PAYMENTS_BUSINESS_ID ?? "",
      ))
  )
    throw new ServiceError(503, "billing_not_configured");
  const webhookKey =
    scope === "dodo_test"
      ? environment.DODO_PAYMENTS_WEBHOOK_KEY
      : environment.YAMA_BILLING_FIXTURE_WEBHOOK_KEY || ephemeralFixtureKey;
  if (!webhookKey || !/^whsec_[a-zA-Z0-9+/]{40,}={0,2}$/.test(webhookKey))
    throw new ServiceError(503, "billing_not_configured");
  return {
    scope,
    test: scope === "dodo_test",
    apiKey: scope === "dodo_test" ? environment.DODO_PAYMENTS_API_KEY! : "",
    webhookKey,
    productId:
      scope === "dodo_test"
        ? environment.DODO_PAYMENTS_PRODUCT_ID!
        : "pdt_fixture",
    businessId:
      scope === "dodo_test"
        ? environment.DODO_PAYMENTS_BUSINESS_ID!
        : "biz_fixture",
    maxApiCalls: parsed.data.YAMA_BILLING_MAX_API_CALLS,
  };
}
export type BillingSettings = ReturnType<typeof billingSettings>;
export const billingConfigHash = (settings: BillingSettings) =>
  createHash("sha256").update(JSON.stringify(settings)).digest("hex");
