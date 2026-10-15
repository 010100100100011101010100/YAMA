import { afterAll, beforeAll, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeSchema } from "@/server/database/schema";
import { EvidenceFiles } from "@/server/evidence/files";
import { EvidenceService, type EvidenceRecord } from "@/server/evidence/service";
import { EvidenceWorker } from "@/server/evidence/worker";
import { validateDocumentOutput } from "@/server/evidence/document-output";
import { ReportRepository } from "@/server/reports/repository";
import { connectGraph, type GraphClient } from "@/server/database/graph-client";
import { GraphStore, privateGraphName } from "@/server/database/graph";
import { getServerConfig } from "@/server/config";

process.loadEnvFile(".env.local");
const namespace = `yama_test_${randomUUID().replaceAll("-", "")}`;
let mongo: MongoClient, database: Db, service: EvidenceService, reports: ReportRepository, files: EvidenceFiles, directory: string;
let graph: GraphClient;
const result = () => validateDocumentOutput({ pages: [{ number: 1, method: "ocr", text: "Fictional OCR note. काल्पनिक रिकॉर्ड।" }] }, "sha256:" + "a".repeat(64));
const create = async () => {
  const report = await reports.create("owner-a", { synthetic: true, language: "en", narrative: "Fictional document test." }, randomUUID());
  const file = await service.upload("owner-a", report._id, randomUUID(), "record.pdf", "application/pdf", Buffer.from("%PDF-1.7\n" + randomUUID()));
  await service.extract("owner-a", report._id, file._id); return { report, file };
};
beforeAll(async () => {
  mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin", serverSelectionTimeoutMS: 5000 });
  await mongo.connect(); database = mongo.db(namespace); await initializeSchema(database);
  directory = await realpath(await mkdtemp(join(tmpdir(), "yama-document-test-"))); files = new EvidenceFiles(directory);
  service = new EvidenceService(database, mongo, files); reports = new ReportRepository(database, mongo);
  const config = getServerConfig(); graph = await connectGraph(config.graphHost, config.graphPort, config.graphPassword);
});
afterAll(async () => {
  if (graph) { for (const name of await graph.list()) if (name.startsWith(`${namespace}_`)) await graph.selectGraph(name).delete(); await graph.close(); }
  if (mongo) { await database.dropDatabase(); await mongo.close(); } if (directory) await rm(directory, { recursive: true, force: true });
});

it("queues durably, freezes output, and binds approval to its text hash", async () => {
  const { report, file } = await create();
  expect(await service.extract("owner-a", report._id, file._id)).toMatchObject({ status: "queued", attempts: 0 });
  await expect(service.source("owner-b", report._id, file._id)).rejects.toThrow("report_not_found");
  await new EvidenceWorker(database, files, async () => result()).runOnce();
  const source = await service.source("owner-a", report._id, file._id);
  expect(source).toMatchObject(result()); expect((await reports.get("owner-a", report._id)).revision).toBe(1);
  const approval = { expectedRevision: 1, acknowledged: true, sha256: file.sha256 };
  await expect(service.review("owner-a", report._id, file._id, approval)).rejects.toThrow("source_changed");
  await expect(service.review("owner-a", report._id, file._id, { ...approval, textSha256: "0".repeat(64) })).rejects.toThrow("source_changed");
  const reviewed = await service.review("owner-a", report._id, file._id, { ...approval, textSha256: source.extraction!.textSha256 });
  expect(reviewed.messages[1].evidenceSource?.extraction).toEqual(source.extraction);
  const corrected = await reports.revise("owner-a", report._id, { operation: "correct_assertion", expectedRevision: 2, assertionId: reviewed.assertions[1].id, value: "User corrected OCR wording." });
  expect(corrected.messages[1]).toEqual(reviewed.messages[1]);
  const confirmed = await reports.confirm("owner-a", report._id, { expectedRevision: 3, acknowledged: true });
  await new GraphStore(graph, namespace).project(confirmed);
  const provenance = await graph.selectGraph(privateGraphName(namespace, "owner-a")).roQuery<{ textHash: string; extraction: string }>("MATCH (s:SourceRange) WHERE s.sourceKind = 'evidence' RETURN s.textSha256 AS textHash, s.extraction AS extraction");
  expect(provenance.data).toContainEqual({ textHash: source.extraction!.textSha256, extraction: JSON.stringify(source.extraction) });
  expect(await service.extract("owner-a", report._id, file._id)).toMatchObject({ status: "ready", attempts: 1 });
  await writeFile(join(directory, `${file._id}.blob`), "tampered");
  await expect(service.source("owner-a", report._id, file._id)).rejects.toThrow("integrity_failed");
});

it("ignores the late output of a worker replaced after its lease expires", async () => {
  const { report, file } = await create();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
  const original = new EvidenceWorker(database, files, async () => { entered(); await resume; return result(); }).runOnce();
  await started;
  await database.collection<EvidenceRecord>("evidence").updateOne({ _id: file._id }, { $set: { leaseUntil: new Date(0) } });
  await database.collection<{ _id: string; leaseUntil: Date }>("evidence_worker_lock").updateOne({ _id: "parser" }, { $set: { leaseUntil: new Date(0) } });
  const replacement = validateDocumentOutput({ pages: [{ number: 1, method: "ocr", text: "Replacement worker output." }] }, "sha256:" + "b".repeat(64));
  await new EvidenceWorker(database, files, async () => replacement).runOnce();
  release(); await original;
  expect(await service.source("owner-a", report._id, file._id)).toMatchObject(replacement);
});

it("allows one parser across workers and refuses a canceled worker's late output", async () => {
  const { report, file } = await create();
  let release!: () => void, entered!: () => void;
  const pending = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
  const running = new EvidenceWorker(database, files, async () => { entered(); await resume; return result(); }).runOnce();
  await pending;
  const another = await create();
  expect(await new EvidenceWorker(database, files, async () => result()).runOnce()).toBe(false);
  await expect(service.cancel("owner-b", report._id, file._id)).rejects.toThrow("report_not_found");
  expect(await service.cancel("owner-a", report._id, file._id)).toMatchObject({ status: "canceled" });
  release(); await running;
  expect(await service.get("owner-a", report._id, file._id)).toMatchObject({ status: "canceled", text: null });
  await service.cancel("owner-a", another.report._id, another.file._id);
});

it("recovers expired leases and ignores a superseded claim", async () => {
  const { report, file } = await create();
  await database.collection<EvidenceRecord>("evidence").updateOne({ _id: file._id }, { $set: { status: "processing", claimToken: "dead-worker", leaseUntil: new Date(0), attempts: 1 } });
  await new EvidenceWorker(database, files, async () => result()).runOnce();
  expect(await service.get("owner-a", report._id, file._id)).toMatchObject({ status: "ready", attempts: 2, claimToken: null });
});

it("caps manual retries and refuses archived files", async () => {
  const { report, file } = await create();
  for (let attempt = 0; attempt < 3; attempt++) {
    await new EvidenceWorker(database, files, async () => { throw new Error("Private parser details"); }).runOnce();
    expect(await service.get("owner-a", report._id, file._id)).toMatchObject({ status: "failed", errorCode: "processing_failed", attempts: attempt + 1 });
    if (attempt < 2) await service.extract("owner-a", report._id, file._id);
  }
  await expect(service.extract("owner-a", report._id, file._id)).rejects.toThrow("retry_limit");
  await service.remove("owner-a", report._id, file._id);
  await expect(service.cancel("owner-a", report._id, file._id)).rejects.toThrow("evidence_not_found");
});
