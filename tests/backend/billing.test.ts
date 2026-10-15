import { describe, it, expect } from "vitest";
import { catalogueVersion } from "@/server/reports/catalogue-policy";
import { billingSettings } from "@/server/billing/config";
import { freeDetailCount, validateCheckoutURL } from "@/server/billing/domain";
describe("test billing boundaries", () => {
  it("defaults to fixtures and rejects live mode or missing test controls", () => {
    expect(billingSettings({ YAMA_DEMO_ONLY: "true" }).scope).toBe("fixture");
    for (const environment of [
      { YAMA_DEMO_ONLY: "false" },
      { YAMA_DEMO_ONLY: "true", YAMA_BILLING_PROVIDER: "live" },
      { YAMA_DEMO_ONLY: "true", YAMA_BILLING_PROVIDER: "dodo_test" },
    ])
      expect(() => billingSettings(environment)).toThrow(
        "billing_not_configured",
      );
  });
  it("rounds the free advanced allowance up while keeping an empty catalogue empty", () => {
    expect(freeDetailCount(0)).toBe(0);
    expect(freeDetailCount(1)).toBe(1);
    expect(freeDetailCount(20)).toBe(6);
  });
  it("accepts only the exact test checkout destination and session path", () => {
    expect(
      validateCheckoutURL(
        "https://test.checkout.dodopayments.com/session/cks_example",
        "cks_example",
      ),
    ).toContain("cks_example");
    for (const url of [
      "https://checkout.dodopayments.com/session/cks_example",
      "http://test.checkout.dodopayments.com/session/cks_example",
      "https://test.checkout.dodopayments.com.evil.example/session/cks_example",
      "https://user:pass@test.checkout.dodopayments.com/session/cks_example",
      "https://test.checkout.dodopayments.com/session/cks_other",
      "https://test.checkout.dodopayments.com/session/cks_example?redirect=https://evil.example",
    ]) {
      expect(() => validateCheckoutURL(url, "cks_example")).toThrow(
        "checkout_destination_rejected",
      );
    }
  });
  it("keeps internal entitlement fencing out of the published source version", () => {
    const entry = {
      _id: "synthetic-test",
      synthetic: true as const,
      published: true,
      title: "Fictional",
      summary: "Authored",
      patterns: [],
      item: "book",
    };
    expect(catalogueVersion({ ...entry, entitlementFence: 5 })).toBe(
      catalogueVersion(entry),
    );
    expect(catalogueVersion({ ...entry, summary: "Changed" })).not.toBe(
      catalogueVersion(entry),
    );
  });
});
