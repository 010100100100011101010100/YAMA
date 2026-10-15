import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { ReportRepository } from "@/server/reports/repository";
import { ActionService } from "@/server/actions/service";
import type { EvidenceRecord } from "@/server/evidence/service";

process.loadEnvFile(".env.local");
const namespace = `yama_actions_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
let mongo: MongoClient, database: Db, actions: ActionService, reports: ReportRepository;
const create = () => reports.create("owner-a", { synthetic: true, language: "en", narrative: "Fictional incident." }, randomUUID());
beforeAll(async () => {
  mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin" });
  await mongo.connect(); database = mongo.db(namespace); await initializeSchema(database);
  actions = new ActionService(database, mongo); reports = new ReportRepository(database, mongo);
});
afterAll(async () => { if (mongo) { await mongo.db(namespace).dropDatabase(); await mongo.close(); } });
describe("owned private action review", () => {
  it("saves an unconfirmed preview once across concurrent retries, without confirming or filing", async () => {
    const report = await create(); const preview = await actions.preview("owner-a", report._id);
    const command = { expectedRevision: 1, receipt: preview.receipt, acknowledged: true };
    const [first, second] = await Promise.all([actions.review("owner-a", report._id, command), actions.review("owner-a", report._id, command)]);
    expect(first.review.status).toBe("reviewed"); expect(second.review).toEqual(first.review);
    expect((await actions.preview("owner-a", report._id)).review).toEqual(first.review);
    expect(await database.collection("action_reviews").countDocuments({ reportId: report._id })).toBe(1);
    expect((await reports.get("owner-a", report._id)).confirmation).toBeNull(); expect(first.submitted).toBe(false);
  });
  it("rejects cross-account reads and approvals, malformed acknowledgements and forged receipts", async () => {
    const report = await create(); const preview = await actions.preview("owner-a", report._id);
    const command = { expectedRevision: 1, receipt: preview.receipt, acknowledged: true };
    await expect(actions.preview("owner-b", report._id)).rejects.toThrow("report_not_found");
    await expect(actions.review("owner-b", report._id, command)).rejects.toThrow("report_not_found");
    await expect(actions.review("owner-a", report._id, { ...command, acknowledged: false })).rejects.toThrow("invalid_request");
    await expect(actions.review("owner-a", report._id, { ...command, submitted: true })).rejects.toThrow("invalid_request");
    await expect(actions.review("owner-a", report._id, { ...command, receipt: "0".repeat(64) })).rejects.toThrow("preview_changed");
  });
  it("requires a fresh review after a report correction", async () => {
    const report = await create(); const preview = await actions.preview("owner-a", report._id);
    await actions.review("owner-a", report._id, { expectedRevision: 1, receipt: preview.receipt, acknowledged: true });
    await reports.revise("owner-a", report._id, { operation: "correct_assertion", expectedRevision: 1, assertionId: report.assertions[0].id, polarity: "uncertain" });
    await expect(actions.review("owner-a", report._id, { expectedRevision: 1, receipt: preview.receipt, acknowledged: true })).rejects.toThrow("revision_conflict");
    expect((await actions.preview("owner-a", report._id)).review.status).toBe("unreviewed");
  });
  it("invalidates review when files change without a report revision", async () => {
    const report = await create(); const preview = await actions.preview("owner-a", report._id);
    const file: EvidenceRecord = { _id: randomUUID(), ownerId: "owner-a", reportId: report._id, uploadKey: randomUUID(), name: "<script>.txt", size: 12,
      sha256: "a".repeat(64), status: "stored", errorCode: null, text: null, extractor: "utf8-v1", createdRevision: 1,
      reviewedMessageId: null, createdAt: new Date(), removedAt: null };
    await database.collection<EvidenceRecord>("evidence").insertOne(file);
    await expect(actions.review("owner-a", report._id, { expectedRevision: 1, receipt: preview.receipt, acknowledged: true })).rejects.toThrow("preview_changed");
    const withFile = await actions.preview("owner-a", report._id);
    await actions.review("owner-a", report._id, { expectedRevision: 1, receipt: withFile.receipt, acknowledged: true });
    await database.collection<EvidenceRecord>("evidence").updateOne({ _id: file._id }, { $set: { removedAt: new Date() } });
    expect((await actions.preview("owner-a", report._id)).review.status).toBe("unreviewed");
  });
  it("rolls back approval if the durable review cannot be saved", async () => {
    const report = await create(); const preview = await actions.preview("owner-a", report._id);
    await database.command({ collMod: "action_reviews", validator: { $jsonSchema: { required: ["unavailable_test_field"] } } });
    try {
      await expect(actions.review("owner-a", report._id, { expectedRevision: 1, receipt: preview.receipt, acknowledged: true })).rejects.toThrow();
      expect((await actions.preview("owner-a", report._id)).review.status).toBe("unreviewed");
    } finally { await initializeSchema(database); }
  });
  it("rechecks a file changed after the approval transaction's snapshot read", async () => {
    const report = await create();
    const file: EvidenceRecord = { _id: randomUUID(), ownerId: "owner-a", reportId: report._id, uploadKey: randomUUID(), name: "note.txt", size: 12,
      sha256: "b".repeat(64), status: "stored", errorCode: null, text: null, extractor: "utf8-v1", createdRevision: 1,
      reviewedMessageId: null, createdAt: new Date(), removedAt: null };
    await database.collection<EvidenceRecord>("evidence").insertOne(file);
    const preview = await actions.preview("owner-a", report._id);
    let entered!: () => void, release!: () => void, paused = false;
    const read = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
    // Pause one real Mongo cursor after its snapshot read, before approval's
    // write fences. The driver must retry and see the changed inventory.
    const gateway = { collection(name: string) {
      const collection = database.collection(name);
      if (name !== "evidence") return collection;
      return { ...collection, find(...args: Parameters<typeof collection.find>) {
        const cursor = collection.find(...args), toArray = cursor.toArray.bind(cursor);
        cursor.toArray = async () => { const rows = await toArray(); if (!paused) { paused = true; entered(); await resume; } return rows; };
        return cursor;
      }, updateMany: collection.updateMany.bind(collection) };
    } } as unknown as Db;
    const reviewing = new ActionService(gateway, mongo).review("owner-a", report._id, { expectedRevision: 1, receipt: preview.receipt, acknowledged: true });
    const rejected = expect(reviewing).rejects.toThrow("preview_changed");
    await read;
    await database.collection<EvidenceRecord>("evidence").updateOne({ _id: file._id }, { $set: { status: "failed", errorCode: "extraction_failed" } });
    release(); await rejected;
    expect(await database.collection("action_reviews").countDocuments({ reportId: report._id })).toBe(0);
  });
});
