import { pathToFileURL } from "node:url";
import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/),
  createInput = z.strictObject({
    purchaseId: z.uuid(),
    origin: z.string(),
    productId: id,
    businessId: id,
  }),
  readInput = z.strictObject({ paymentId: id });
export async function executeBillingSDK(
  operation,
  input,
  apiKey,
  transport = {},
) {
  const value = (
    operation === "create_checkout" ? createInput : readInput
  ).parse(input);
  let calls = 0;
  const fetch = transport.fetch ?? globalThis.fetch,
    deadline = AbortSignal.timeout(15000);
  const allowed =
    operation === "create_checkout"
      ? [`/products/${value.productId}`, "/checkouts"]
      : [`/payments/${value.paymentId}`];
  const safeFetch = async (url, options) => {
    const destination = new URL(String(url));
    if (
      destination.origin !== "https://test.dodopayments.com" ||
      destination.search ||
      destination.hash ||
      destination.pathname !== allowed[calls++] ||
      (destination.pathname === "/checkouts"
        ? options.method !== "POST"
        : options.method !== "GET")
    )
      throw new Error("billing_destination_rejected");
    const response = await fetch(url, {
        ...options,
        redirect: "error",
        signal: deadline,
      }),
      reader = response.body?.getReader();
    if (!reader) throw new Error("billing_response_invalid");
    const chunks = [];
    let bytes = 0;
    while (true) {
      const packet = await reader.read();
      if (packet.done) break;
      bytes += packet.value.length;
      if (bytes > 262144) {
        await reader.cancel();
        throw new Error("billing_response_limit");
      }
      chunks.push(packet.value);
    }
    return new Response(Buffer.concat(chunks), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  const { default: DodoPayments } = await import("dodopayments"),
    client = new DodoPayments({
      bearerToken: apiKey,
      environment: "test_mode",
      maxRetries: 0,
      timeout: 15000,
      fetch: safeFetch,
    });
  if (operation === "create_checkout") {
    const origin = new URL(value.origin);
    if (
      origin.protocol !== "http:" ||
      origin.hostname !== "127.0.0.1" ||
      origin.origin !== value.origin
    )
      throw new Error("billing_origin_rejected");
    const product = await client.products.retrieve(value.productId);
    if (
      product.product_id !== value.productId ||
      product.business_id !== value.businessId ||
      product.is_recurring ||
      product.price?.type !== "one_time_price" ||
      product.price.currency !== "USD" ||
      product.price.price !== 1000 ||
      product.price.tax_inclusive !== true ||
      product.price.pay_what_you_want ||
      product.price.purchasing_power_parity ||
      (product.price.discount ?? 0) !== 0 ||
      (product.price.discount_bps ?? 0) !== 0 ||
      product.archived ||
      product.license_key_enabled ||
      (product.credit_entitlements?.length ?? 0) > 0 ||
      (product.entitlements?.length ?? 0) > 0
    )
      throw new Error("billing_product_mismatch");
    const session = await client.checkoutSessions.create(
      {
        product_cart: [{ product_id: value.productId, quantity: 1 }],
        billing_currency: "USD",
        return_url: `${origin.origin}/api/billing/return`,
        metadata: {
          yama_purchase_id: value.purchaseId,
          yama_offer: "intelligence-ten-v1",
        },
        feature_flags: {
          allow_discount_code: false,
          allow_currency_selection: false,
          allow_phone_number_collection: false,
        },
        allowed_payment_method_types: ["credit", "debit"],
      },
      { headers: { "Idempotency-Key": `yama-checkout/${value.purchaseId}` } },
    );
    return { sessionId: session.session_id, url: session.checkout_url ?? null };
  }
  const payment = await client.payments.retrieve(value.paymentId);
  return {
    payment: {
      paymentId: payment.payment_id,
      businessId: payment.business_id,
      purchaseId: payment.metadata?.yama_purchase_id ?? null,
      sessionId: payment.checkout_session_id ?? null,
      status: payment.status,
      currency: payment.currency,
      amount: payment.total_amount,
      cart:
        payment.product_cart?.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })) ?? [],
      refunded:
        !!payment.refund_status ||
        payment.refunds?.some((refund) => refund.status === "succeeded") ===
          true,
      disputed: (payment.disputes?.length ?? 0) > 0,
      subscription:
        !!payment.is_multi_subscription ||
        !!payment.is_update_payment_method ||
        !!payment.subscription_id ||
        (payment.subscription_ids?.length ?? 0) > 0,
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log = console.warn = console.error = console.info = () => undefined;
  try {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.YAMA_DEMO_ONLY !== "true" ||
      process.env.YAMA_DODO_TEST_ENABLED !== "true" ||
      process.env.YAMA_DODO_DATA_POLICY_ACKNOWLEDGED !== "true"
    )
      throw new Error("billing_disabled");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 4096) throw new Error("billing_input_limit");
      chunks.push(chunk);
    }
    const result = await executeBillingSDK(
      process.argv[2],
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
      process.env.DODO_PAYMENTS_API_KEY,
    );
    process.stdout.write(JSON.stringify(result));
  } catch {
    process.stdout.write(JSON.stringify({ error: "billing_provider_failed" }));
    process.exitCode = 1;
  }
}
