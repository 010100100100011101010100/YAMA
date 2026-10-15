import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID, createHmac } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { BillingService } from "@/server/billing/service";
import { BillingWorker } from "@/server/billing/worker";
import { billingSettings } from "@/server/billing/config";
import type { BillingRunner } from "@/server/billing/runtime";
process.loadEnvFile(".env.local");
const namespace = `yama_billing_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
  secret = "whsec_" + Buffer.alloc(32, 7).toString("base64");
const settings = billingSettings({
  YAMA_DEMO_ONLY: "true",
  YAMA_BILLING_PROVIDER: "dodo_test",
  YAMA_DODO_TEST_ENABLED: "true",
  YAMA_DODO_DATA_POLICY_ACKNOWLEDGED: "true",
  DODO_PAYMENTS_API_KEY: "fixture-dodo-key",
  DODO_PAYMENTS_WEBHOOK_KEY: secret,
  DODO_PAYMENTS_PRODUCT_ID: "pdt_fixture",
  DODO_PAYMENTS_BUSINESS_ID: "biz_fixture",
});
let client: MongoClient,
  db: Db,
  service: BillingService,
  worker: BillingWorker,
  purchaseId: string;
const snapshots = new Map<string, unknown>();
const runner: BillingRunner = vi.fn(async (operation, input) =>
  operation === "create_checkout"
    ? {
        sessionId: `cks_${input.purchaseId}`,
        url: `https://test.checkout.dodopayments.com/session/cks_${input.purchaseId}`,
      }
    : { payment: snapshots.get(input.paymentId!) },
);
function signed(
  type = "payment.succeeded",
  paymentId = "pay_fixture",
  change: Record<string, unknown> = {},
  id = randomUUID(),
) {
  const data = {
      payment_id: paymentId,
      metadata: { yama_purchase_id: purchaseId },
      ...change,
    },
    raw = JSON.stringify({
      business_id: "biz_fixture",
      type,
      timestamp: new Date().toISOString(),
      data,
    }),
    timestamp = String(Math.floor(Date.now() / 1000));
  return {
    raw,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature":
        "v1," +
        createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
          .update(`${id}.${timestamp}.${raw}`)
          .digest("base64"),
    },
  };
}
function payment(
  paymentId = "pay_fixture",
  changes: Record<string, unknown> = {},
) {
  return {
    paymentId,
    businessId: "biz_fixture",
    purchaseId,
    sessionId: `cks_${purchaseId}`,
    status: "succeeded",
    currency: "USD",
    amount: 1000,
    cart: [{ product_id: "pdt_fixture", quantity: 1 }],
    refunded: false,
    disputed: false,
    subscription: false,
    ...changes,
  };
}
async function paid() {
  const event = signed();
  snapshots.set("pay_fixture", payment());
  await service.receiveWebhook(event.raw, event.headers);
  await worker.runOnce();
}
beforeAll(async () => {
  client = new MongoClient(
    "mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true",
    {
      auth: {
        username: "yama_root",
        password: process.env.MONGO_ROOT_PASSWORD!,
      },
      authSource: "admin",
    },
  );
  await client.connect();
  db = client.db(namespace);
  await initializeSchema(db);
});
beforeEach(async () => {
  for (const name of [
    "billing_purchases",
    "billing_events",
    "billing_grants",
    "billing_reversals",
    "billing_accounts",
    "billing_budget",
  ])
    await db.collection(name).deleteMany({});
  snapshots.clear();
  vi.mocked(runner).mockClear();
  service = new BillingService(
    db,
    client,
    () => settings,
    "http://127.0.0.1:3000",
    runner,
  );
  worker = new BillingWorker(service, runner);
  purchaseId = (
    await service.createCheckout("owner-a", {
      key: randomUUID(),
      acknowledged: true,
    })
  ).id;
});
afterAll(async () => {
  if (client) {
    await client.db(namespace).dropDatabase();
    await client.close();
  }
});
describe("verified checkout and credit grants", () => {
  it("creates an owned fixed offer without private incident or owner data in provider input", async () => {
    const purchase = await service.getPurchase("owner-a", purchaseId);
    expect(purchase).toMatchObject({
      status: "ready",
      amount: 1000,
      currency: "USD",
      credits: 10,
      testOnly: true,
    });
    expect(JSON.stringify(vi.mocked(runner).mock.calls[0][1])).not.toContain(
      "owner-a",
    );
    await expect(service.getPurchase("owner-b", purchaseId)).rejects.toThrow(
      "purchase_not_found",
    );
    await expect(
      service.createCheckout("owner-a", {
        key: randomUUID(),
        acknowledged: true,
        amount: 1,
      }),
    ).rejects.toThrow("invalid_request");
  });
  it("never grants credits for checkout creation or a return query", async () => {
    expect((await service.balance("owner-a")).available).toBe(0);
  });
  it("replays a checkout key without creating another provider session", async () => {
    const key = randomUUID(),
      first = await service.createCheckout("owner-a", {
        key,
        acknowledged: true,
      }),
      second = await service.createCheckout("owner-a", {
        key,
        acknowledged: true,
      });
    expect(first.id).toBe(second.id);
    expect(
      vi
        .mocked(runner)
        .mock.calls.filter((call) => call[0] === "create_checkout"),
    ).toHaveLength(2);
  });
  it("grants ten once even for duplicate IDs and distinct success events for the same payment", async () => {
    const event = signed();
    snapshots.set("pay_fixture", payment());
    await service.receiveWebhook(event.raw, event.headers);
    await service.receiveWebhook(event.raw, event.headers);
    await worker.runOnce();
    const next = signed();
    await service.receiveWebhook(next.raw, next.headers);
    await worker.runOnce();
    expect((await service.balance("owner-a")).available).toBe(10);
    expect(await db.collection("billing_grants").countDocuments()).toBe(1);
  });
  it("rejects altered signatures before persistence", async () => {
    const event = signed();
    await expect(
      service.receiveWebhook(event.raw + " ", event.headers),
    ).rejects.toThrow("webhook_signature_invalid");
    expect(await db.collection("billing_events").countDocuments()).toBe(0);
  });
  it("does not trust metadata, price, currency or a mismatched provider session", async () => {
    for (const change of [
      { amount: 999 },
      { currency: "INR" },
      { sessionId: "cks_other" },
      { cart: [{ product_id: "pdt_other", quantity: 1 }] },
      { purchaseId: randomUUID() },
      { businessId: "biz_other" },
      { subscription: true },
    ]) {
      snapshots.set("pay_fixture", payment("pay_fixture", change));
      const event = signed();
      await service.receiveWebhook(event.raw, event.headers);
      await worker.runOnce();
    }
    expect((await service.balance("owner-a")).available).toBe(0);
  });
  it("retains reversal tombstones when refund arrives before payment success", async () => {
    snapshots.set("pay_fixture", payment());
    const refund = signed("refund.succeeded", "pay_fixture", {
      status: "succeeded",
    });
    await service.receiveWebhook(refund.raw, refund.headers);
    await worker.runOnce();
    await paid();
    expect((await service.balance("owner-a")).available).toBe(0);
    expect((await service.getPurchase("owner-a", purchaseId)).status).toBe(
      "reversed",
    );
  });
  it("revokes unused credits after a refund or opened dispute", async () => {
    await paid();
    const dispute = signed("dispute.opened");
    await service.receiveWebhook(dispute.raw, dispute.headers);
    await worker.runOnce();
    expect((await service.balance("owner-a")).available).toBe(0);
  });
  it("keeps fixture and Dodo test credit ledgers separate", async () => {
    await paid();
    const fixture = new BillingService(
      db,
      client,
      () =>
        billingSettings({
          YAMA_DEMO_ONLY: "true",
          YAMA_BILLING_FIXTURE_WEBHOOK_KEY: secret,
        }),
      "http://127.0.0.1:3000",
      runner,
    );
    expect((await fixture.balance("owner-a")).available).toBe(0);
  });
  it("does not repeat an uncertain checkout POST", async () => {
    const uncertain: BillingRunner = async () => {
      throw new Error("Fake transport failure");
    };
    const isolated = new BillingService(
        db,
        client,
        () => settings,
        "http://127.0.0.1:3000",
        uncertain,
      ),
      key = randomUUID();
    expect(
      (await isolated.createCheckout("owner-a", { key, acknowledged: true }))
        .status,
    ).toBe("creation_unknown");
    expect(
      (await isolated.createCheckout("owner-a", { key, acknowledged: true }))
        .status,
    ).toBe("creation_unknown");
  });
  it("rejects stale signed deliveries and conflicting bodies under the same event ID", async () => {
    const event = signed();
    const timestamp = String(Math.floor(Date.now() / 1000) - 600);
    const stale = {
      ...event.headers,
      "webhook-timestamp": timestamp,
      "webhook-signature":
        "v1," +
        createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
          .update(`${event.headers["webhook-id"]}.${timestamp}.${event.raw}`)
          .digest("base64"),
    };
    await expect(service.receiveWebhook(event.raw, stale)).rejects.toThrow(
      "webhook_signature_invalid",
    );
    await service.receiveWebhook(event.raw, event.headers);
    const conflicting = signed(
      "refund.succeeded",
      "pay_fixture",
      {},
      event.headers["webhook-id"],
    );
    await expect(
      service.receiveWebhook(conflicting.raw, conflicting.headers),
    ).rejects.toThrow("webhook_id_conflict");
    expect(await service.events.countDocuments()).toBe(1);
  });
  it("recovers an interrupted read-only verification without duplicate credits", async () => {
    const event = signed();
    snapshots.set("pay_fixture", payment());
    await service.receiveWebhook(event.raw, event.headers);
    expect(await service.claim("interrupted-worker")).toBeTruthy();
    await service.events.updateMany({}, { $set: { leaseUntil: new Date(0) } });
    await db
      .collection("billing_worker_lock")
      .updateOne({ _id: "billing" } as never, {
        $set: { leaseUntil: new Date(0) },
      });
    await worker.runOnce();
    expect((await service.balance("owner-a")).available).toBe(10);
    expect((await service.events.findOne())?.attempts).toBe(2);
  });
  it("serializes workers and stops provider verification at the reserved call ceiling", async () => {
    const event = signed();
    snapshots.set("pay_fixture", payment());
    await service.receiveWebhook(event.raw, event.headers);
    const outcomes = await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect((await service.balance("owner-a")).available).toBe(10);
    expect(
      vi.mocked(runner).mock.calls.filter((call) => call[0] === "read_payment"),
    ).toHaveLength(1);
    const next = signed();
    await service.receiveWebhook(next.raw, next.headers);
    const capped = new BillingService(
      db,
      client,
      () => ({ ...settings, maxApiCalls: 3 }),
      "http://127.0.0.1:3000",
      runner,
    );
    await new BillingWorker(capped, runner).runOnce();
    expect(
      vi.mocked(runner).mock.calls.filter((call) => call[0] === "read_payment"),
    ).toHaveLength(1);
    expect(
      (await db.collection("billing_budget").findOne())?.reservedCalls,
    ).toBe(3);
  });
});
