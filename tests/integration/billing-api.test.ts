import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { connectGraph } from "@/server/database/graph-client";
import { GraphStore, privateGraphName } from "@/server/database/graph";
import { ReportRepository } from "@/server/reports/repository";
import { MongoClient, ObjectId } from "mongodb";
import { getServerConfig } from "@/server/config";
import { billingSettings } from "@/server/billing/config";
import { BillingService } from "@/server/billing/service";
import { BillingWorker } from "@/server/billing/worker";
import { anonymousSignIn } from "./anonymous-session";
process.loadEnvFile(".env.local");
const config = getServerConfig(),
  owners: string[] = [],
  purchaseIds: string[] = [];
const mongo = new MongoClient(
  "mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true",
  {
    auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! },
    authSource: "admin",
  },
);
let cookieA: string, cookieB: string, purchaseId: string;
async function call(
  path: string,
  cookie = cookieA,
  method = "GET",
  body?: unknown,
  origin = config.origin,
) {
  return fetch(config.origin + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}
async function signIn() {
  const result = await anonymousSignIn(config.origin);
  if (!result.ok) throw new Error("Synthetic session unavailable");
  owners.push((await result.json()).user.id);
  return result.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
beforeAll(async () => {
  if (billingSettings().test)
    throw new Error("Billing HTTP tests require fixture mode");
  cookieA = await signIn();
  cookieB = await signIn();
});
afterAll(async () => {
  try {
    const db = mongo.db(config.mongoDatabase);
    for (const name of [
      "billing_purchases",
      "billing_accounts",
      "billing_grants",
      "billing_consumptions",
      "intelligence_accesses",
      "intelligence_batches",
      "reports",
      "report_revisions",
      "graph_outbox",
    ])
      await db.collection(name).deleteMany({ ownerId: { $in: owners } });
    await db.collection("billing_events").deleteMany({
      _id: { $in: purchaseIds.map((id) => `fixture:fixture_${id}`) },
    } as never);
    await db.collection("billing_reversals").deleteMany({
      _id: { $in: purchaseIds.map((id) => `fixture:pay_${id}`) },
    } as never);
    const ids = owners
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    for (const name of ["session", "account"])
      await db
        .collection(name)
        .deleteMany({ userId: { $in: [...owners, ...ids] } });
    await db.collection("user").deleteMany({ _id: { $in: ids } });
    const graph = await connectGraph(
      config.graphHost,
      config.graphPort,
      config.graphPassword,
    );
    try {
      const names = new Set(await graph.list());
      for (const owner of owners) {
        const name = privateGraphName(config.mongoDatabase, owner);
        if (names.has(name)) await graph.selectGraph(name).delete();
      }
    } finally {
      await graph.close();
    }
  } finally {
    await mongo.close();
  }
});
describe("owned fixture checkout HTTP flow", () => {
  it("offers fixed test pricing and never accepts browser-selected prices", async () => {
    expect(await (await call("/api/billing/offer", "")).json()).toMatchObject({
      offer: { amount: 1000, currency: "USD", credits: 10, testOnly: true },
    });
    expect(
      (
        await call("/api/billing/checkouts", cookieA, "POST", {
          key: randomUUID(),
          acknowledged: true,
          amount: 1,
        })
      ).status,
    ).toBe(400);
    const key = randomUUID(),
      response = await call("/api/billing/checkouts", cookieA, "POST", {
        key,
        acknowledged: true,
      });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const purchase = (await response.json()).purchase;
    purchaseId = purchase.id;
    purchaseIds.push(purchaseId);
    expect(purchase).toMatchObject({
      provider: "fixture",
      status: "ready",
      url: null,
      credits: 10,
    });
    for (const field of [
      "ownerId",
      "configHash",
      "sessionId",
      "paymentId",
      "requestKey",
    ])
      expect(purchase).not.toHaveProperty(field);
    expect(
      (
        await (
          await call("/api/billing/checkouts", cookieA, "POST", {
            key,
            acknowledged: true,
          })
        ).json()
      ).purchase.id,
    ).toBe(purchaseId);
  });
  it("blocks foreign accounts, missing sessions and hostile mutation origins", async () => {
    for (const [suffix, method, input] of [
      ["", "GET", undefined],
      ["/fixture-complete", "POST", { acknowledged: true }],
    ] as const) {
      expect(
        (
          await call(
            `/api/billing/checkouts/${purchaseId}${suffix}`,
            cookieB,
            method,
            input,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await call(
            `/api/billing/checkouts/${purchaseId}${suffix}`,
            "",
            method,
            input,
          )
        ).status,
      ).toBe(401);
    }
    expect(
      (
        await call(
          `/api/billing/checkouts/${purchaseId}/fixture-complete`,
          cookieA,
          "POST",
          { acknowledged: true },
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect((await call("/api/billing/balance", "")).status).toBe(401);
  });
  it("strips return queries without granting credits and rejects unsigned webhook data", async () => {
    const result = await call(
      "/api/billing/return?status=succeeded&payment_id=forged&email=private@example.invalid",
      "",
    );
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe(config.origin + "/");
    expect(
      (await (await call("/api/billing/balance")).json()).balance.available,
    ).toBe(0);
    expect(
      (
        await call("/api/billing/webhook", "", "POST", {
          type: "payment.succeeded",
          data: { payment_id: "forged" },
        })
      ).status,
    ).toBe(401);
    const oversized = await fetch(config.origin + "/api/billing/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: " ".repeat(128 * 1024 + 1),
    });
    expect(oversized.status).toBe(413);
  });
  it("grants credits only after the durable verified event is processed, once", async () => {
    expect(
      (
        await call(
          `/api/billing/checkouts/${purchaseId}/fixture-complete`,
          cookieA,
          "POST",
          { acknowledged: true },
        )
      ).status,
    ).toBe(202);
    expect(
      (await (await call("/api/billing/balance")).json()).balance.available,
    ).toBe(0);
    await new BillingWorker(
      new BillingService(mongo.db(config.mongoDatabase), mongo),
    ).runOnce();
    expect(
      (await (await call("/api/billing/balance")).json()).balance.available,
    ).toBe(10);
    expect(
      (await (await call(`/api/billing/checkouts/${purchaseId}`)).json())
        .purchase.status,
    ).toBe("paid");
    await call(
      `/api/billing/checkouts/${purchaseId}/fixture-complete`,
      cookieA,
      "POST",
      { acknowledged: true },
    );
    await new BillingWorker(
      new BillingService(mongo.db(config.mongoDatabase), mongo),
    ).runOnce();
    expect(
      (await (await call("/api/billing/balance")).json()).balance.available,
    ).toBe(10);
    expect(
      (await (await call("/api/billing/balance", cookieB)).json()).balance
        .available,
    ).toBe(0);
  });
  it("uses the actual owned graph result for the free preview and atomically unlocks one protected fixture", async () => {
    const repository = new ReportRepository(
      mongo.db(config.mongoDatabase),
      mongo,
    );
    let report = await repository.create(
      owners[0],
      {
        synthetic: true,
        language: "en",
        narrative: "Paid for a fictional book.",
      },
      randomUUID(),
    );
    report = await repository.revise(owners[0], report._id, {
      operation: "propose_assertions",
      expectedRevision: 1,
      proposals: [
        {
          field: "pattern",
          value: "paid",
          polarity: "affirmed",
          source: { messageId: report.messages[0].id, start: 0, end: 4 },
        },
      ],
    });
    report = await repository.confirm(owners[0], report._id, {
      expectedRevision: 2,
      acknowledged: true,
    });
    const graph = await connectGraph(
      config.graphHost,
      config.graphPort,
      config.graphPassword,
    );
    try {
      await new GraphStore(graph, config.mongoDatabase).project(report);
    } finally {
      await graph.close();
    }
    await mongo
      .db(config.mongoDatabase)
      .collection("graph_outbox")
      .updateOne(
        { ownerId: owners[0], reportId: report._id, revision: 2 },
        { $set: { status: "done" } },
      );
    const path = `/api/reports/${report._id}/intelligence`,
      result = await call(path);
    expect(result.status).toBe(200);
    const batch = (await result.json()).intelligence;
    expect(batch).toMatchObject({
      freeCount: 6,
      total: 20,
      kind: "authored_entitlement_fixture",
    });
    expect(batch.details[6].body).toBeNull();
    expect(batch.details[6].source).toBeNull();
    const detailPath = `${path}/${batch.id}/${batch.details[6].id}`;
    expect((await call(detailPath)).status).toBe(402);
    expect((await call(detailPath, cookieB)).status).toBe(404);
    const command = {
      key: randomUUID(),
      expectedRevision: 2,
      receipt: batch.receipt,
      acknowledged: true,
    };
    expect(
      (await call(detailPath + "/unlock", cookieB, "POST", command)).status,
    ).toBe(404);
    expect(
      (
        await call(
          detailPath + "/unlock",
          cookieA,
          "POST",
          command,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    const unlocked = await call(
      detailPath + "/unlock",
      cookieA,
      "POST",
      command,
    );
    expect(unlocked.status).toBe(200);
    expect((await unlocked.json()).charged).toBe(1);
    expect(
      (
        await (
          await call(detailPath + "/unlock", cookieA, "POST", command)
        ).json()
      ).charged,
    ).toBe(0);
    expect((await call(detailPath)).status).toBe(200);
    expect(
      (await (await call("/api/billing/balance")).json()).balance.available,
    ).toBe(9);
    expect((await call(`/api/reports/${report._id}/connections`)).status).toBe(
      200,
    );
    expect((await call("/api/assistance?language=en", "")).status).toBe(200);
  });
});
