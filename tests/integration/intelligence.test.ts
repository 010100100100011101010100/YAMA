import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { ReportRepository } from "@/server/reports/repository";
import type { Report } from "@/server/reports/domain";
import {
  catalogueVersion,
  type CatalogueCase,
} from "@/server/reports/catalogue-policy";
import { BillingService } from "@/server/billing/service";
import { BillingWorker } from "@/server/billing/worker";
import { IntelligenceService } from "@/server/billing/intelligence";
import { billingSettings } from "@/server/billing/config";
import { CONNECTION_RECIPE, type ConnectionsResult } from "@/lib/connections";
process.loadEnvFile(".env.local");
const namespace = `yama_intelligence_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
let client: MongoClient,
  db: Db,
  report: Report,
  billing: BillingService,
  intelligence: IntelligenceService;
const entry: CatalogueCase = {
  _id: "synthetic-test",
  synthetic: true,
  published: true,
  title: "Fictional source",
  summary: "Authored fictional example.",
  patterns: ["paid"],
  item: "book",
};
const command = (batch: { receipt: string }, key = randomUUID()) => ({
  expectedRevision: report.revision,
  receipt: batch.receipt,
  key,
  acknowledged: true,
});
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
    "reports",
    "report_revisions",
    "graph_outbox",
    "catalogue",
    "billing_purchases",
    "billing_events",
    "billing_grants",
    "billing_reversals",
    "billing_accounts",
    "intelligence_batches",
    "intelligence_accesses",
    "billing_consumptions",
  ])
    await db.collection(name).deleteMany({});
  await db.collection("catalogue").insertOne(entry as never);
  const reports = new ReportRepository(db, client);
  report = await reports.create(
    "owner-a",
    {
      synthetic: true,
      language: "en",
      narrative: "Paid for a fictional book.",
    },
    randomUUID(),
  );
  report = await reports.revise("owner-a", report._id, {
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
  report = await reports.confirm("owner-a", report._id, {
    expectedRevision: 2,
    acknowledged: true,
  });
  billing = new BillingService(
    db,
    client,
    () => billingSettings({ YAMA_DEMO_ONLY: "true" }),
    "http://127.0.0.1:3000",
  );
  const comparison = async (): Promise<ConnectionsResult> => ({
    status: "ready",
    reportId: report._id,
    revision: report.revision,
    recipe: CONNECTION_RECIPE,
    sources: [
      {
        assertionId: report.assertions[1].id,
        value: "paid",
        originalValue: "paid",
        corrected: false,
        origin: "client_proposal",
        included: true,
        polarity: "affirmed",
        status: "supporting",
        verification: "not_verified",
        quote: "Paid",
        source: report.assertions[1].source,
        evidence: null,
      },
    ],
    candidates: [
      {
        id: entry._id,
        title: entry.title,
        summary: entry.summary,
        synthetic: true,
        pattern: {
          shared: ["paid"],
          different: [],
          basis: "confirmed_pattern_tags",
        },
        linkage: {
          status: "not_assessed",
          explanation: "No identity link assessed.",
        },
        differences: [],
        explanation: {
          catalogueVersion: catalogueVersion(entry),
          sourceKind: "authored_synthetic",
          paths: [{ pattern: "paid", assertionIds: [report.assertions[1].id] }],
        },
      },
    ],
  });
  intelligence = new IntelligenceService(db, client, billing, comparison);
});
afterAll(async () => {
  if (client) {
    await client.db(namespace).dropDatabase();
    await client.close();
  }
});
async function credits() {
  const purchase = await billing.createCheckout("owner-a", {
    key: randomUUID(),
    acknowledged: true,
  });
  await billing.completeFixture("owner-a", purchase.id, { acknowledged: true });
  await new BillingWorker(billing).runOnce();
}
describe("free and paid owned detail access", () => {
  it("shows six of twenty fixture details free without leaking locked bodies", async () => {
    const batch = await intelligence.preview("owner-a", report._id);
    expect(batch.freeCount).toBe(6);
    expect(batch.details).toHaveLength(20);
    expect(batch.details[0].body).toBeTruthy();
    expect(batch.details[6].body).toBeNull();
    expect((await billing.balance("owner-a")).available).toBe(0);
  });
  it("rejects unknown and foreign detail references before spending", async () => {
    const batch = await intelligence.preview("owner-a", report._id);
    await credits();
    await expect(
      intelligence.unlock(
        "owner-b",
        report._id,
        batch.id,
        batch.details[6].id,
        command(batch),
      ),
    ).rejects.toThrow("report_not_found");
    await expect(
      intelligence.unlock(
        "owner-a",
        report._id,
        batch.id,
        randomUUID(),
        command(batch),
      ),
    ).rejects.toThrow("detail_not_found");
    expect((await billing.balance("owner-a")).available).toBe(10);
  });
  it("charges one credit only for a distinct protected detail, with free repeat reads", async () => {
    const batch = await intelligence.preview("owner-a", report._id);
    await credits();
    const input = command(batch),
      detail = batch.details[6].id;
    expect(
      (
        await intelligence.unlock(
          "owner-a",
          report._id,
          batch.id,
          detail,
          input,
        )
      ).charged,
    ).toBe(1);
    expect(
      (
        await intelligence.unlock(
          "owner-a",
          report._id,
          batch.id,
          detail,
          input,
        )
      ).reused,
    ).toBe(true);
    expect(
      (
        await intelligence.unlock(
          "owner-a",
          report._id,
          batch.id,
          detail,
          command(batch),
        )
      ).charged,
    ).toBe(0);
    expect((await billing.balance("owner-a")).available).toBe(9);
    expect(
      (await intelligence.read("owner-a", report._id, batch.id, detail)).body,
    ).toBeTruthy();
  });
  it("cannot spend the last credit twice under concurrent requests", async () => {
    const batch = await intelligence.preview("owner-a", report._id);
    await credits();
    await billing.grants.updateMany(
      { ownerId: "owner-a" },
      { $set: { remaining: 1 } },
    );
    const outcomes = await Promise.allSettled(
      [6, 7].map((index) =>
        intelligence.unlock(
          "owner-a",
          report._id,
          batch.id,
          batch.details[index].id,
          command(batch),
        ),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await billing.balance("owner-a")).available).toBe(0);
  });
  it("does not spend on changed publication or stale report revisions", async () => {
    const batch = await intelligence.preview("owner-a", report._id);
    await credits();
    await db
      .collection("catalogue")
      .updateOne({ _id: entry._id } as never, { $set: { published: false } });
    await expect(
      intelligence.unlock(
        "owner-a",
        report._id,
        batch.id,
        batch.details[6].id,
        command(batch),
      ),
    ).rejects.toThrow("intelligence_stale");
    expect((await billing.balance("owner-a")).available).toBe(10);
  });
  it("does not restore paid access after the purchase has been reversed", async () => {
    const batch = await intelligence.preview("owner-a", report._id);
    await credits();
    const grant = await billing.grants.findOne({ ownerId: "owner-a" });
    await intelligence.unlock(
      "owner-a",
      report._id,
      batch.id,
      batch.details[6].id,
      command(batch),
    );
    await billing.grants.updateOne(
      { _id: grant!._id },
      { $set: { active: false, remaining: 0 } },
    );
    await expect(
      intelligence.read("owner-a", report._id, batch.id, batch.details[6].id),
    ).rejects.toThrow("detail_locked");
  });
  it("does not charge for free details and rejects a key reused for a different detail", async () => {
    const batch = await intelligence.preview("owner-a", report._id),
      input = command(batch);
    expect(
      (
        await intelligence.unlock(
          "owner-a",
          report._id,
          batch.id,
          batch.details[0].id,
          input,
        )
      ).charged,
    ).toBe(0);
    await credits();
    await expect(
      intelligence.unlock(
        "owner-a",
        report._id,
        batch.id,
        batch.details[6].id,
        input,
      ),
    ).rejects.toThrow("idempotency_conflict");
    expect((await billing.balance("owner-a")).available).toBe(10);
  });
  it("invalidates paid-detail requests after a report edit or source-content change", async () => {
    const batch = await intelligence.preview("owner-a", report._id);
    await credits();
    await db
      .collection<Report>("reports")
      .updateOne({ _id: report._id }, { $inc: { revision: 1 } });
    await expect(
      intelligence.unlock(
        "owner-a",
        report._id,
        batch.id,
        batch.details[6].id,
        command(batch),
      ),
    ).rejects.toThrow("intelligence_stale");
    await db
      .collection<Report>("reports")
      .updateOne({ _id: report._id }, { $inc: { revision: -1 } });
    await db
      .collection<CatalogueCase>("catalogue")
      .updateOne(
        { _id: entry._id },
        { $set: { summary: "Changed fictional source" } },
      );
    await expect(
      intelligence.unlock(
        "owner-a",
        report._id,
        batch.id,
        batch.details[6].id,
        command(batch),
      ),
    ).rejects.toThrow("intelligence_stale");
    expect((await billing.balance("owner-a")).available).toBe(10);
  });
  it("returns no manufactured details when the confirmed comparison has no matches", async () => {
    const empty = new IntelligenceService(db, client, billing, async () => ({
      status: "ready",
      reportId: report._id,
      revision: report.revision,
      recipe: CONNECTION_RECIPE,
      sources: [],
      candidates: [],
    }));
    expect(await empty.preview("owner-a", report._id)).toMatchObject({
      freeCount: 0,
      total: 0,
      details: [],
    });
    expect((await billing.balance("owner-a")).available).toBe(0);
  });
});
