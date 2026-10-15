import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeSchema } from "@/server/database/schema";
import { EvidenceFiles } from "@/server/evidence/files";
import { EvidenceService } from "@/server/evidence/service";
import { ReportRepository } from "@/server/reports/repository";
import { connectGraph, type GraphClient } from "@/server/database/graph-client";
import { GraphStore, privateGraphName } from "@/server/database/graph";
import { getServerConfig } from "@/server/config";

process.loadEnvFile(".env.local");
const namespace = `yama_test_${randomUUID().replaceAll("-", "")}`;
let mongo: MongoClient, database: Db, service: EvidenceService, reports: ReportRepository, directory: string, graph: GraphClient;
const create = (owner = "owner-a") => reports.create(owner, { synthetic: true, language: "en", narrative: "Fictional evidence test." }, randomUUID());
const upload = (reportId: string, words = "  काल्पनिक रिकॉर्ड।\nPayment ka note.  ", owner = "owner-a", key = randomUUID()) => service.upload(owner, reportId, key, "record.txt", "text/plain", Buffer.from(words));
beforeAll(async () => {
  mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin", serverSelectionTimeoutMS: 5000 });
  await mongo.connect(); database = mongo.db(namespace); await initializeSchema(database);
  directory = await realpath(await mkdtemp(join(tmpdir(), "yama-evidence-test-")));
  service = new EvidenceService(database, mongo, new EvidenceFiles(directory)); reports = new ReportRepository(database, mongo);
  const config = getServerConfig(); graph = await connectGraph(config.graphHost, config.graphPort, config.graphPassword);
});
afterAll(async () => {
  if (graph) {
    for (const name of await graph.list()) if (name.startsWith(`${namespace}_`)) await graph.selectGraph(name).delete();
    await graph.close();
  }
  if (mongo) { await mongo.db(namespace).dropDatabase(); await mongo.close(); }
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe("real evidence storage and transactions", () => {
  it("refuses file symlinks instead of reading their target", async () => {
    const report = await create(); const file = await upload(report._id); const blob = join(directory, `${file._id}.blob`);
    const outside = join(directory, "outside.txt"); await writeFile(outside, "Private target"); await unlink(blob); await symlink(outside, blob);
    expect(await service.extract("owner-a", report._id, file._id)).toMatchObject({ status: "failed", errorCode: "file_unavailable" });
    await unlink(blob); await unlink(outside);
  });
  it("deduplicates concurrent uploads without reserving two slots or leaking storage names", async () => {
    const report = await create(); const key = randomUUID();
    const [first, second] = await Promise.all([upload(report._id, "Fictional duplicate", "owner-a", key), upload(report._id, "Fictional duplicate")]);
    expect(first._id).toBe(second._id); expect((await reports.get("owner-a", report._id)).evidenceCount).toBe(1);
    expect((await stat(join(directory, `${first._id}.blob`))).mode & 0o777).toBe(0o600);
    expect((await readFile(join(directory, `${first._id}.blob`))).toString()).toBe("Fictional duplicate");
    await expect(upload(report._id, "Different words", "owner-a", key)).rejects.toThrow("idempotency_conflict");
  });
  it("rejects a reused key even if matching content appears during the byte write", async () => {
    const report = await create(), key = randomUUID(); const pendingText = "Fictional pending content";
    let release!: () => void, entered!: () => void;
    const written = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
    class PausedFiles extends EvidenceFiles {
      async write(id: string, bytes: Buffer) { await super.write(id, bytes); entered(); await resume; }
    }
    const paused = new EvidenceService(database, mongo, new PausedFiles(directory));
    const pending = paused.upload("owner-a", report._id, key, "record.txt", "text/plain", Buffer.from(pendingText));
    // Both records appear after the pending request's initial idempotency/deduplication reads.
    await written; await upload(report._id, pendingText); await upload(report._id, "Different content", "owner-a", key);
    const rejection = expect(pending).rejects.toThrow("idempotency_conflict"); release(); await rejection;
    expect((await reports.get("owner-a", report._id)).evidenceCount).toBe(2);
  });
  it("isolates files by owner and report, even when content hashes match", async () => {
    const firstReport = await create(), secondReport = await create("owner-b"), another = await create();
    const first = await upload(firstReport._id), second = await upload(secondReport._id, undefined, "owner-b");
    expect(first.sha256).toBe(second.sha256); expect(first._id).not.toBe(second._id);
    await expect(service.source("owner-b", firstReport._id, first._id)).rejects.toThrow("report_not_found");
    await expect(service.get("owner-a", another._id, first._id)).rejects.toThrow("evidence_not_found");
    await expect(service.extract("owner-b", firstReport._id, first._id)).rejects.toThrow("report_not_found");
    await expect(service.remove("owner-b", firstReport._id, first._id)).rejects.toThrow("report_not_found");
  });
  it("preserves exact extracted wording without changing a confirmed report", async () => {
    const report = await create(); await reports.confirm("owner-a", report._id, { expectedRevision: 1, acknowledged: true });
    const file = await upload(report._id); await service.extract("owner-a", report._id, file._id);
    expect((await service.source("owner-a", report._id, file._id)).text).toBe("  काल्पनिक रिकॉर्ड।\nPayment ka note.  ");
    expect((await reports.get("owner-a", report._id)).confirmation?.revision).toBe(1);
    expect((await service.list("owner-a", report._id))[0]).toMatchObject({ status: "ready", reviewed: false });
  });
  it("records failed extraction and refuses corrupted sources", async () => {
    const report = await create(); const invalid = await service.upload("owner-a", report._id, randomUUID(), "invalid.txt", "text/plain", Buffer.from([0xff]));
    expect(await service.extract("owner-a", report._id, invalid._id)).toMatchObject({ status: "failed", errorCode: "invalid_utf8", text: null });
    await expect(service.source("owner-a", report._id, invalid._id)).rejects.toThrow("text_not_ready");
    const valid = await upload(report._id); await service.extract("owner-a", report._id, valid._id);
    await writeFile(join(directory, `${valid._id}.blob`), "tampered");
    await expect(service.source("owner-a", report._id, valid._id)).rejects.toThrow("integrity_failed");
    expect(await service.extract("owner-a", report._id, valid._id)).toMatchObject({ status: "failed", errorCode: "integrity_failed" });
  });
  it("requires acknowledgement, source hash and the current revision, then imports once", async () => {
    const report = await create(); const file = await upload(report._id); await service.extract("owner-a", report._id, file._id);
    const approval = { expectedRevision: 1, acknowledged: true, sha256: file.sha256 };
    await expect(service.review("owner-a", report._id, file._id, { ...approval, acknowledged: false })).rejects.toThrow("invalid_request");
    await expect(service.review("owner-a", report._id, file._id, { ...approval, sha256: "0".repeat(64) })).rejects.toThrow("source_changed");
    await expect(service.review("owner-a", report._id, file._id, { ...approval, expectedRevision: 2 })).rejects.toThrow("revision_conflict");
    const reviewed = await service.review("owner-a", report._id, file._id, approval);
    expect(reviewed.revision).toBe(2); expect(reviewed.confirmation).toBeNull();
    const replay = await service.review("owner-a", report._id, file._id, approval);
    expect(replay.messages).toHaveLength(2); expect(replay.revision).toBe(2);
    expect((await service.get("owner-a", report._id, file._id)).reviewedMessageId).toBe(reviewed.messages[1].id);
    const confirmed = await reports.confirm("owner-a", report._id, { expectedRevision: 2, acknowledged: true });
    await new GraphStore(graph, namespace).project(confirmed);
    const provenance = await graph.selectGraph(privateGraphName(namespace, "owner-a")).roQuery<{ id: string; hash: string }>("MATCH (s:SourceRange) WHERE s.sourceKind = 'evidence' RETURN s.evidenceId AS id, s.sha256 AS hash");
    expect(provenance.data).toContainEqual({ id: file._id, hash: file.sha256 });
  });
  it("rolls back file review and report changes if the revision snapshot cannot be stored", async () => {
    const report = await create(); const file = await upload(report._id); await service.extract("owner-a", report._id, file._id);
    await database.command({ collMod: "report_revisions", validator: { $jsonSchema: { required: ["unavailable_test_field"] } } });
    try {
      await expect(service.review("owner-a", report._id, file._id, { expectedRevision: 1, acknowledged: true, sha256: file.sha256 })).rejects.toThrow();
      expect((await reports.get("owner-a", report._id)).revision).toBe(1);
      expect((await service.get("owner-a", report._id, file._id)).reviewedMessageId).toBeNull();
    } finally { await initializeSchema(database); }
  });
  it("archives a reviewed file without erasing its immutable report source", async () => {
    const report = await create(); const file = await upload(report._id); await service.extract("owner-a", report._id, file._id);
    await service.review("owner-a", report._id, file._id, { expectedRevision: 1, acknowledged: true, sha256: file.sha256 });
    await service.remove("owner-a", report._id, file._id); await service.remove("owner-a", report._id, file._id);
    expect(await service.list("owner-a", report._id)).toEqual([]);
    await expect(service.source("owner-a", report._id, file._id)).rejects.toThrow("evidence_not_found");
    expect((await reports.get("owner-a", report._id)).messages[1].evidenceSource?.evidenceId).toBe(file._id);
  });
  it("atomically admits only one upload into the last quota slot", async () => {
    const report = await create();
    for (let index = 0; index < 19; index++) await upload(report._id, `Fictional file ${index}`);
    const attempts = await Promise.allSettled([upload(report._id, "Last file a"), upload(report._id, "Last file b")]);
    expect(attempts.filter(attempt => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === "rejected")).toHaveLength(1);
    expect((await reports.get("owner-a", report._id)).evidenceCount).toBe(20);
    expect(await service.list("owner-a", report._id)).toHaveLength(20);
    const ids = new Set((await database.collection("evidence").find({}).toArray()).map(record => `${record._id}.blob`));
    expect((await readdir(directory)).every(name => ids.has(name))).toBe(true);
  });
});
