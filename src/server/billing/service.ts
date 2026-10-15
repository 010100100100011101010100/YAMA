import "server-only";
import { createHash, randomUUID, createHmac } from "node:crypto";
import { z } from "zod";
import type { Db, MongoClient, ClientSession } from "mongodb";
import {
  BILLING_OFFER,
  checkoutCommand,
  checkoutViewSchema,
} from "@/lib/billing";
import { parse } from "@/server/reports/domain";
import { getServerConfig } from "@/server/config";
import { ServiceError } from "@/server/errors";
import { transactionOptions } from "@/server/dialogue/service";
import {
  billingSettings,
  billingConfigHash,
  type BillingSettings,
} from "./config";
import {
  verifiedBillingEvent,
  paymentSnapshotSchema,
  validateCheckoutURL,
  providerId,
  type PaymentSnapshot,
} from "./domain";
import { runBillingProvider, type BillingRunner } from "./runtime";
import type {
  PurchaseRecord,
  EventRecord,
  CreditGrant,
  CreditAccount,
  ReversalRecord,
} from "./records";
type Lock = { _id: string; claimToken: string | null; leaseUntil: Date };
type Budget = { _id: "dodo-test"; reservedCalls: number };
export class BillingService {
  constructor(
    readonly database: Db,
    readonly client: MongoClient,
    readonly settings: () => BillingSettings = billingSettings,
    readonly origin = getServerConfig().origin,
    private readonly run: BillingRunner = runBillingProvider,
  ) {}
  get purchases() {
    return this.database.collection<PurchaseRecord>("billing_purchases");
  }
  get events() {
    return this.database.collection<EventRecord>("billing_events");
  }
  get grants() {
    return this.database.collection<CreditGrant>("billing_grants");
  }
  async touchAccount(
    ownerId: string,
    scope: BillingSettings["scope"],
    session: ClientSession,
  ) {
    await this.database
      .collection<CreditAccount>("billing_accounts")
      .updateOne(
        { _id: `${scope}:${ownerId}` },
        { $inc: { fence: 1 }, $setOnInsert: { ownerId, scope } },
        { upsert: true, session },
      );
  }
  view(purchase: PurchaseRecord) {
    const expired =
      purchase.status === "ready" && purchase.expiresAt <= new Date();
    return checkoutViewSchema.parse({
      id: purchase._id,
      provider: purchase.scope,
      testOnly: true,
      amount: BILLING_OFFER.amount,
      currency: BILLING_OFFER.currency,
      credits: BILLING_OFFER.credits,
      offer: BILLING_OFFER.id,
      status: expired ? "expired" : purchase.status,
      url: !expired && purchase.status === "ready" ? purchase.url : null,
      createdAt: purchase.createdAt.toISOString(),
      expiresAt: purchase.expiresAt.toISOString(),
      errorCode: purchase.errorCode,
    });
  }
  async getPurchase(ownerId: string, id: string) {
    const purchase = await this.purchases.findOne({
      _id: id,
      ownerId,
      scope: this.settings().scope,
    });
    if (!purchase) throw new ServiceError(404, "purchase_not_found");
    return this.view(purchase);
  }
  async reserveCalls(
    count: number,
    settings: BillingSettings,
    session?: ClientSession,
  ) {
    if (!settings.test) return;
    const budgets = this.database.collection<Budget>("billing_budget");
    await budgets.updateOne(
      { _id: "dodo-test" },
      { $setOnInsert: { reservedCalls: 0 } },
      { upsert: true, session },
    );
    const update = await budgets.updateOne(
      {
        _id: "dodo-test",
        reservedCalls: { $lte: settings.maxApiCalls - count },
      },
      { $inc: { reservedCalls: count } },
      { session },
    );
    if (!update.matchedCount)
      throw new ServiceError(422, "billing_budget_exhausted");
  }
  async createCheckout(ownerId: string, input: unknown) {
    const command = parse(checkoutCommand, input),
      settings = this.settings(),
      key = command.key;
    const result = await this.client.withSession((session) =>
      session.withTransaction(async () => {
        await this.touchAccount(ownerId, settings.scope, session);
        const existing = await this.purchases.findOne(
          { ownerId, scope: settings.scope, requestKey: key },
          { session },
        );
        if (existing) return { purchase: existing, created: false };
        if (
          (await this.purchases.countDocuments(
            { ownerId, scope: settings.scope },
            { session },
          )) >= 20
        )
          throw new ServiceError(422, "checkout_goal_limit");
        await this.reserveCalls(2, settings, session);
        const now = new Date(),
          purchase: PurchaseRecord = {
            _id: randomUUID(),
            ownerId,
            scope: settings.scope,
            requestKey: key,
            configHash: billingConfigHash(settings),
            productId: settings.productId,
            businessId: settings.businessId,
            status: "creating",
            sessionId: null,
            url: null,
            paymentId: null,
            createdAt: now,
            expiresAt: new Date(now.getTime() + 86400000),
            errorCode: null,
          };
        await this.purchases.insertOne(purchase, { session });
        return { purchase, created: true };
      }, transactionOptions),
    );
    const purchase = result.purchase;
    if (!result.created) {
      if (
        purchase.status === "creating" &&
        purchase.createdAt.getTime() < Date.now() - 25000
      ) {
        await this.purchases.updateOne(
          { _id: purchase._id, status: "creating" },
          {
            $set: {
              status: "creation_unknown",
              errorCode: "checkout_outcome_unknown",
            },
          },
        );
        return this.getPurchase(ownerId, purchase._id);
      }
      return this.view(purchase);
    }
    try {
      const output = settings.test
        ? await this.run(
            "create_checkout",
            {
              purchaseId: purchase._id,
              origin: this.origin,
              productId: purchase.productId,
              businessId: purchase.businessId,
            },
            settings,
            AbortSignal.timeout(20000),
          )
        : { sessionId: `cks_${purchase._id}`, url: null };
      const parsed = z
        .strictObject({ sessionId: providerId, url: z.string().nullable() })
        .parse(output);
      const url = settings.test
        ? validateCheckoutURL(parsed.url ?? "", parsed.sessionId)
        : null;
      if (billingConfigHash(this.settings()) !== purchase.configHash)
        throw new Error("checkout_config_changed");
      await this.purchases.updateOne(
        { _id: purchase._id, status: "creating" },
        { $set: { status: "ready", sessionId: parsed.sessionId, url } },
      );
    } catch {
      await this.purchases.updateOne(
        { _id: purchase._id, status: "creating" },
        {
          $set: {
            status: "creation_unknown",
            errorCode: "checkout_outcome_unknown",
          },
        },
      );
    }
    return this.getPurchase(ownerId, purchase._id);
  }
  async balance(ownerId: string) {
    const scope = this.settings().scope,
      grants = await this.grants.find({ ownerId, scope }).toArray();
    return {
      scope,
      testOnly: true,
      available: grants
        .filter((grant) => grant.active)
        .reduce((sum, grant) => sum + grant.remaining, 0),
      purchased: grants.reduce((sum, grant) => sum + grant.total, 0),
      revoked: grants
        .filter((grant) => !grant.active)
        .reduce((sum, grant) => sum + grant.total, 0),
    };
  }
  async receiveWebhook(raw: string, headers: Record<string, string>) {
    const settings = this.settings(),
      event = verifiedBillingEvent(raw, headers, settings);
    if (!event) return { received: true, ignored: true };
    const webhookId = headers["webhook-id"];
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(webhookId ?? ""))
      throw new ServiceError(400, "webhook_payload_invalid");
    const id = `${settings.scope}:${webhookId}`,
      rawHash = createHash("sha256").update(raw).digest("hex"),
      existing = await this.events.findOne({ _id: id });
    if (existing) {
      if (existing.rawHash !== rawHash)
        throw new ServiceError(409, "webhook_id_conflict");
      return { received: true, duplicate: true };
    }
    const now = new Date(),
      record: EventRecord = {
        _id: id,
        scope: settings.scope,
        webhookId,
        rawHash,
        event,
        status: "pending",
        attempts: 0,
        dueAt: now,
        leaseUntil: null,
        claimToken: null,
        errorCode: null,
        createdAt: now,
      };
    try {
      await this.events.insertOne(record);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const repeated = await this.events.findOne({ _id: id });
      if (repeated?.rawHash !== rawHash)
        throw new ServiceError(409, "webhook_id_conflict");
    }
    return { received: true };
  }
  async completeFixture(ownerId: string, id: string, input: unknown) {
    parse(z.strictObject({ acknowledged: z.literal(true) }), input);
    const settings = this.settings();
    if (settings.test) throw new ServiceError(404, "fixture_checkout_disabled");
    const purchase = await this.purchases.findOne({
      _id: id,
      ownerId,
      scope: "fixture",
    });
    if (!purchase) throw new ServiceError(404, "purchase_not_found");
    if (
      !["ready", "paid"].includes(purchase.status) ||
      purchase.expiresAt <= new Date()
    )
      throw new ServiceError(409, "fixture_checkout_unavailable");
    const paymentId = `pay_${purchase._id}`,
      snapshot: PaymentSnapshot = {
        paymentId,
        businessId: purchase.businessId,
        purchaseId: purchase._id,
        sessionId: purchase.sessionId!,
        status: "succeeded",
        currency: "USD",
        amount: 1000,
        cart: [{ product_id: purchase.productId, quantity: 1 }],
        refunded: false,
        disputed: false,
        subscription: false,
      };
    await this.purchases.updateOne(
      { _id: id, ownerId, scope: "fixture" },
      { $set: { fixturePayment: snapshot } },
    );
    const webhookId = `fixture_${purchase._id}`,
      timestamp = String(Math.floor(Date.now() / 1000));
    const existing = await this.events.findOne({ _id: `fixture:${webhookId}` });
    if (!existing) {
      const raw = JSON.stringify({
          business_id: purchase.businessId,
          type: "payment.succeeded",
          timestamp: purchase.createdAt.toISOString(),
          data: { payment_id: paymentId },
        }),
        signature =
          "v1," +
          createHmac(
            "sha256",
            Buffer.from(settings.webhookKey.slice(6), "base64"),
          )
            .update(`${webhookId}.${timestamp}.${raw}`)
            .digest("base64");
      await this.receiveWebhook(raw, {
        "webhook-id": webhookId,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
      });
    }
    return this.getPurchase(ownerId, id);
  }
  async claim(token: string) {
    const settings = this.settings();
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const now = new Date(),
          locks = this.database.collection<Lock>("billing_worker_lock"),
          lock = await locks.findOneAndUpdate(
            { _id: "billing", leaseUntil: { $lte: now } },
            {
              $set: {
                claimToken: token,
                leaseUntil: new Date(now.getTime() + 40000),
              },
            },
            { session, returnDocument: "after" },
          );
        if (!lock) return null;
        await this.events.updateMany(
          {
            scope: settings.scope,
            status: "processing",
            leaseUntil: { $lte: now },
          },
          {
            $set: {
              status: "pending",
              claimToken: null,
              leaseUntil: null,
              errorCode: "verification_interrupted",
            },
          },
          { session },
        );
        await this.events.updateMany(
          { scope: settings.scope, status: "pending", attempts: { $gte: 3 } },
          {
            $set: {
              status: "failed",
              errorCode: "payment_verification_failed",
            },
          },
          { session },
        );
        const record = await this.events.findOneAndUpdate(
          {
            scope: settings.scope,
            status: "pending",
            attempts: { $lt: 3 },
            dueAt: { $lte: now },
          },
          {
            $set: {
              status: "processing",
              claimToken: token,
              leaseUntil: new Date(now.getTime() + 30000),
            },
            $inc: { attempts: 1 },
          },
          { session, returnDocument: "after", sort: { createdAt: 1 } },
        );
        if (!record) {
          await locks.updateOne(
            { _id: "billing", claimToken: token },
            { $set: { claimToken: null, leaseUntil: new Date(0) } },
            { session },
          );
          return null;
        }
        return { record, settings };
      }, transactionOptions),
    );
  }
  async applyPayment(event: EventRecord, token: string, raw: unknown) {
    const parsed = paymentSnapshotSchema.safeParse(raw);
    if (!parsed.success) throw new ServiceError(400, "payment_mismatch");
    const payment = parsed.data;
    await this.client.withSession((session) =>
      session.withTransaction(async () => {
        const active = await this.events.findOne(
          {
            _id: event._id,
            status: "processing",
            claimToken: token,
            leaseUntil: { $gt: new Date() },
          },
          { session },
        );
        if (!active) throw new ServiceError(409, "billing_claim_stale");
        const purchase = await this.purchases.findOne(
          {
            _id: payment.purchaseId,
            scope: event.scope,
            sessionId: payment.sessionId,
            businessId: payment.businessId,
          },
          { session },
        );
        if (
          !purchase ||
          payment.paymentId !== event.event.paymentId ||
          payment.businessId !== event.event.businessId ||
          payment.currency !== "USD" ||
          payment.amount !== 1000 ||
          payment.subscription ||
          payment.cart.length !== 1 ||
          payment.cart[0].product_id !== purchase.productId ||
          payment.cart[0].quantity !== 1 ||
          (purchase.paymentId && purchase.paymentId !== payment.paymentId)
        )
          throw new ServiceError(400, "payment_mismatch");
        await this.touchAccount(purchase.ownerId, event.scope, session);
        const reversed =
          payment.refunded ||
          payment.disputed ||
          event.event.type.startsWith("refund.") ||
          event.event.type.startsWith("dispute.");
        const grantId = `${event.scope}:${payment.paymentId}`,
          reversals =
            this.database.collection<ReversalRecord>("billing_reversals");
        if (reversed) {
          await reversals.updateOne(
            { _id: grantId },
            {
              $setOnInsert: {
                scope: event.scope,
                paymentId: payment.paymentId,
                reason: event.event.type,
                createdAt: new Date(),
              },
            },
            { upsert: true, session },
          );
          await this.grants.updateOne(
            { _id: grantId },
            { $set: { active: false, remaining: 0 } },
            { session },
          );
          await this.purchases.updateOne(
            { _id: purchase._id },
            {
              $set: {
                status: "reversed",
                paymentId: payment.paymentId,
                url: null,
              },
            },
            { session },
          );
        } else if (
          payment.status === "succeeded" &&
          event.event.type === "payment.succeeded"
        ) {
          const reversal = await reversals.findOne(
            { _id: grantId },
            { session },
          );
          if (reversal)
            await this.purchases.updateOne(
              { _id: purchase._id },
              {
                $set: {
                  status: "reversed",
                  paymentId: payment.paymentId,
                  url: null,
                },
              },
              { session },
            );
          else {
            await this.grants.updateOne(
              { _id: grantId },
              {
                $setOnInsert: {
                  scope: event.scope,
                  ownerId: purchase.ownerId,
                  purchaseId: purchase._id,
                  paymentId: payment.paymentId,
                  total: 10,
                  remaining: 10,
                  active: true,
                  createdAt: new Date(),
                },
              },
              { upsert: true, session },
            );
            await this.purchases.updateOne(
              { _id: purchase._id },
              {
                $set: {
                  status: "paid",
                  paymentId: payment.paymentId,
                  url: null,
                  errorCode: null,
                },
              },
              { session },
            );
          }
        } else if (
          ["failed", "cancelled"].includes(payment.status) &&
          !["paid", "reversed"].includes(purchase.status)
        )
          await this.purchases.updateOne(
            { _id: purchase._id },
            {
              $set: {
                status: "failed",
                errorCode: "payment_not_completed",
                url: null,
              },
            },
            { session },
          );
        await this.events.updateOne(
          { _id: event._id, status: "processing", claimToken: token },
          {
            $set: {
              status: "done",
              claimToken: null,
              leaseUntil: null,
              errorCode: null,
            },
          },
          { session },
        );
      }, transactionOptions),
    );
  }
  async fail(event: EventRecord, token: string, permanent: boolean) {
    await this.events.updateOne(
      { _id: event._id, status: "processing", claimToken: token },
      {
        $set: {
          status: permanent || event.attempts >= 3 ? "failed" : "pending",
          claimToken: null,
          leaseUntil: null,
          errorCode: permanent
            ? "payment_mismatch"
            : "payment_verification_unavailable",
          dueAt: new Date(Date.now() + 5000 * event.attempts),
        },
      },
    );
  }
  async release(token: string) {
    await this.database
      .collection<Lock>("billing_worker_lock")
      .updateOne(
        { _id: "billing", claimToken: token },
        { $set: { claimToken: null, leaseUntil: new Date(0) } },
      );
  }
}
