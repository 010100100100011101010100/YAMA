import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { executeBillingSDK } from "./billing-provider.mjs";
const mode = process.argv[2],
  purchaseId = randomUUID(),
  sessionId = "cks_fixture",
  calls = [];
const fetch = async (url, options) => {
  const endpoint = new URL(String(url));
  calls.push(endpoint.pathname);
  assert.equal(endpoint.origin, "https://test.dodopayments.com");
  assert.equal(options.redirect, "error");
  if (mode === "unavailable")
    return new Response(JSON.stringify({ message: "Fake upstream error" }), {
      status: 503,
    });
  if (endpoint.pathname === "/products/pdt_fixture")
    return Response.json({
      product_id: "pdt_fixture",
      business_id: "biz_fixture",
      is_recurring: false,
      credit_entitlements:
        mode === "native-entitlements" ? [{ id: "unrelated" }] : [],
      entitlements: [],
      license_key_enabled: false,
      price: {
        type: "one_time_price",
        currency: "USD",
        price: mode === "wrong-price" ? 999 : 1000,
        tax_inclusive: true,
      },
    });
  if (endpoint.pathname === "/checkouts") {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.product_cart, [
      { product_id: "pdt_fixture", quantity: 1 },
    ]);
    assert.deepEqual(body.metadata, {
      yama_purchase_id: purchaseId,
      yama_offer: "intelligence-ten-v1",
    });
    assert.equal(body.return_url, "http://127.0.0.1:3000/api/billing/return");
    assert.equal(
      new Headers(options.headers).get("Idempotency-Key"),
      `yama-checkout/${purchaseId}`,
    );
    assert.equal(body.feature_flags.allow_discount_code, false);
    assert.equal(body.feature_flags.allow_currency_selection, false);
    for (const field of [
      "customer",
      "billing_address",
      "confirm",
      "payment_method_id",
      "discount_code",
      "subscription_data",
    ])
      assert.equal(body[field], undefined);
    return Response.json({
      session_id: sessionId,
      checkout_url: `https://test.checkout.dodopayments.com/session/${sessionId}`,
    });
  }
  return Response.json({
    payment_id: "pay_fixture",
    business_id: "biz_fixture",
    metadata: { yama_purchase_id: purchaseId, secret: "Do not export" },
    checkout_session_id: sessionId,
    status: "succeeded",
    currency: "USD",
    total_amount: 1000,
    product_cart: [{ product_id: "pdt_fixture", quantity: 1 }],
    refunds: [],
    disputes: [],
    subscription_ids: [],
    customer: {
      name: "PRIVATE BILLING NAME",
      email: "private@example.invalid",
    },
    billing: { street: "PRIVATE BILLING STREET" },
    card_last_four: "1234",
  });
};
if (mode === "read") {
  const output = await executeBillingSDK(
    "read_payment",
    { paymentId: "pay_fixture" },
    "fake-dodo-key",
    { fetch },
  );
  assert.equal(output.payment.amount, 1000);
  assert.equal(output.payment.purchaseId, purchaseId);
  assert.doesNotMatch(
    JSON.stringify(output),
    /PRIVATE|private@example|1234|Do not export/,
  );
} else if (
  mode === "wrong-price" ||
  mode === "native-entitlements" ||
  mode === "unavailable"
) {
  await assert.rejects(() =>
    executeBillingSDK(
      "create_checkout",
      {
        purchaseId,
        productId: "pdt_fixture",
        businessId: "biz_fixture",
        origin: "http://127.0.0.1:3000",
      },
      "fake-dodo-key",
      { fetch },
    ),
  );
  assert.equal(calls.length, 1);
} else {
  const output = await executeBillingSDK(
    "create_checkout",
    {
      purchaseId,
      productId: "pdt_fixture",
      businessId: "biz_fixture",
      origin: "http://127.0.0.1:3000",
    },
    "fake-dodo-key",
    { fetch },
  );
  assert.equal(output.sessionId, sessionId);
  assert.deepEqual(calls, ["/products/pdt_fixture", "/checkouts"]);
}
process.stdout.write(
  JSON.stringify({
    passed: true,
    requests: mode === "create" ? 2 : 1,
    network: false,
  }),
);
