import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoClient, type Db } from "mongodb";
import { getServerConfig } from "@/server/config";
import { initializeSchema } from "@/server/database/schema";
import { connectGraph, type GraphClient } from "@/server/database/graph-client";
import { GraphStore } from "@/server/database/graph";
import { EvidenceFiles } from "@/server/evidence/files";
import { EvidenceService, type EvidenceRecord } from "@/server/evidence/service";
import { seedDemoDataset } from "@/server/reports/seed-demo";
import { demoCatalogue, demoSourceReport, demoUuid, demoReporterOwner } from "@/server/reports/demo-cases";
import { ReportRepository, jobKey, type GraphJob } from "@/server/reports/repository";
import { getConnections } from "@/server/reports/connections";
import type { CatalogueCase } from "@/server/reports/catalogue-policy";
import type { Report } from "@/server/reports/domain";
import { DialogueService, type DialogueRecord } from "@/server/dialogue/service";
import { dialogueContext, runDialogueSnapshot } from "@/server/dialogue/runtime";
import { readSharedEvidence, readSharedVideo } from "@/server/reports/shared-evidence";

process.loadEnvFile(".env.local");
const namespace = `yama_demo_test_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
let mongo: MongoClient, database: Db, falkor: GraphClient, graph: GraphStore, files: EvidenceFiles, directory: string, reports: ReportRepository;
beforeAll(async () => {
  const config = getServerConfig();
  mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin", serverSelectionTimeoutMS: 5000 });
  await mongo.connect(); database = mongo.db(namespace); await initializeSchema(database);
  falkor = await connectGraph(config.graphHost, config.graphPort, config.graphPassword); graph = new GraphStore(falkor, namespace);
  directory = await realpath(await mkdtemp(join(tmpdir(), "yama-demo-evidence-"))); files = new EvidenceFiles(directory);
  reports = new ReportRepository(database, mongo);
}, 30_000);
afterAll(async () => {
  if (falkor) { for (const name of await falkor.list()) if (name.startsWith(`${namespace}_`)) await falkor.selectGraph(name).delete(); await falkor.close(); }
  if (mongo) { await mongo.db(namespace).dropDatabase(); await mongo.close(); }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function query(text: string) {
  const report = await reports.create("private-query-owner", { synthetic: true, language: "en", narrative: text }, randomUUID());
  const confirmed = await reports.confirm("private-query-owner", report._id, { expectedRevision: 1, acknowledged: true });
  await graph.project(confirmed);
  await database.collection<GraphJob>("graph_outbox").updateOne({ _id: jobKey(confirmed) }, { $set: { status: "done" } });
  return getConnections(reports, graph, "private-query-owner", report._id);
}
describe("40case demo dataset on real MongoDB and FalkorDB", () => {
  it("seeds40 reports,40 PNG uploads and40 reviewed transcriptions idempotently", async () => {
    const first = await seedDemoDataset(database, mongo, graph, files);
    const second = await seedDemoDataset(database, mongo, graph, files);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ cases: 40, images: 40, transcriptions: 40 });
    expect(await database.collection("catalogue").countDocuments({ dataset: "synthetic-incidents-v3" })).toBe(40);
    const published = await falkor.selectGraph(`${namespace}_catalogue`).roQuery<{ count: number }>("MATCH (c:CatalogueCase) WHERE c.synthetic = true AND c.published = true RETURN count(c) AS count");
    expect(published.data?.[0]?.count).toBe(40);
    expect(await database.collection("reports").countDocuments()).toBe(40);
    expect(await database.collection("evidence").countDocuments()).toBe(80);
    expect(await database.collection("evidence").countDocuments({ format: "text", status: "ready", reviewedMessageId: { $ne: null } })).toBe(40);
    expect(await database.collection("reports").countDocuments({ "reporter.name": { $exists: true } })).toBe(40);
    const names = await falkor.selectGraph(`${namespace}_catalogue`).roQuery<{ name: string }>("MATCH (c:CatalogueCase) RETURN c.reporterName AS name ORDER BY name");
    expect(names.data!.map(row => row.name)).toEqual(demoCatalogue.map(entry => entry.reporter!.name).sort());
    for (const record of await database.collection<EvidenceRecord>("evidence").find({ format: "png" }).toArray()) {
      const bytes = await files.read(record._id);
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
      expect(record.name).not.toMatch(/synthetic-demo|testing|aadhaar/i);
    }
  }, 120_000);
  it("returns exact-contact-only matches with contrasting outcomes and source ranges", async () => {
    const result = await query("Synthetic report: the contact was +1 202 555 0101, gadget1@yama-demo.invalid and @yama_demo_gadget_01.");
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates.every(candidate => candidate.pattern.shared.length === 0 && candidate.identifiers!.length === 3)).toBe(true);
    expect(result.candidates.map(candidate => candidate.resolution!.status).sort()).toEqual(["partially_resolved", "resolved", "unresolved", "unresolved"]);
    expect(result.candidates.every(candidate => candidate.linkage.status === "possible_shared_identifier")).toBe(true);
    expect(result.candidates.flatMap(candidate => candidate.evidence!)).toHaveLength(8);
    expect(result.candidates.some(candidate => candidate.id === demoCatalogue[24]._id)).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic-reporter:");
    for (const reporter of demoCatalogue.filter(entry => result.candidates.some(candidate => candidate.id === entry._id)).map(entry => entry.reporter!)) {
      for (const name of reporter.name.split(" ")) expect(JSON.stringify(result)).not.toMatch(new RegExp(`\\b${name}\\b`, "u"));
    }
    expect(result.candidates[0].title).not.toContain(" · ");
  });
  it("serves a filtered image only for the owned confirmed report and current matched case version", async () => {
    const result = await query("Armaan Rane used +1 202 555 0101 for my order.");
    const candidate = result.candidates[0], version = candidate.explanation.catalogueVersion;
    const bytes = await readSharedEvidence(reports, graph, "private-query-owner", result.reportId, candidate.id, result.revision, version);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    for (const related of result.candidates) {
      expect(related.summary).not.toContain("gadget1@yama-demo.invalid");
      expect(related.summary).not.toContain("@yama_demo_gadget_01");
    }
    const camera = result.candidates.find(candidate => candidate.id === demoCatalogue[1]._id)!;
    const clip = await readSharedVideo(reports, graph, "private-query-owner", result.reportId, camera.id, result.revision, camera.explanation.catalogueVersion);
    expect(clip.subarray(4, 8).toString()).toBe("ftyp");
    await expect(readSharedVideo(reports, graph, "unrelated-account", result.reportId, camera.id, result.revision, camera.explanation.catalogueVersion)).rejects.toThrow("report_not_found");
    await expect(readSharedVideo(reports, graph, "private-query-owner", result.reportId, candidate.id, result.revision, version)).rejects.toThrow("evidence_not_found");
    await expect(readSharedEvidence(reports, graph, "unrelated-account", result.reportId, candidate.id, result.revision, version)).rejects.toThrow("report_not_found");
    await expect(readSharedEvidence(reports, graph, "private-query-owner", result.reportId, demoCatalogue[3]._id, result.revision, version)).rejects.toThrow("evidence_not_found");
    await expect(readSharedEvidence(reports, graph, "private-query-owner", result.reportId, candidate.id, result.revision, "b".repeat(64))).rejects.toThrow("evidence_not_found");
    await reports.revise("private-query-owner", result.reportId, { operation: "add_message", expectedRevision: result.revision, text: "I need to correct that account." });
    await expect(readSharedEvidence(reports, graph, "private-query-owner", result.reportId, candidate.id, result.revision, version)).rejects.toThrow("confirmation_required");
  });
  it("blocks negated/uncertain contacts and never equates a similar story with a shared person", async () => {
    expect((await query("I did not contact @yama_demo_gadget_01. Maybe gadget1@yama-demo.invalid was involved.")).candidates).toEqual([]);
    const result = await query("The contact was @yama_demo_gadget_02.");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe(demoCatalogue[3]._id);
  });
  it("keeps underlying reporter files private even though synthetic comparison summaries are shared", async () => {
    const entry = await database.collection<CatalogueCase>("catalogue").findOne({ _id: demoCatalogue[0]._id });
    const evidence = new EvidenceService(database, mongo, files);
    await expect(reports.get("private-query-owner", entry!.sourceReportId!)).rejects.toThrow("report_not_found");
    await expect(evidence.get("private-query-owner", entry!.sourceReportId!, entry!.evidence![0].id)).rejects.toThrow("report_not_found");
    expect((await reports.list("private-query-owner")).some(report => report._id === entry!.sourceReportId)).toBe(false);
  });
  it("rejects fabricated graph contact evidence instead of displaying it", async () => {
    const report = await reports.create("private-query-owner", { synthetic: true, language: "en", narrative: "The contact was @yama_demo_gadget_01." }, randomUUID());
    const confirmed = await reports.confirm("private-query-owner", report._id, { expectedRevision: 1, acknowledged: true });
    await graph.project(confirmed); await database.collection<GraphJob>("graph_outbox").updateOne({ _id: jobKey(confirmed) }, { $set: { status: "done" } });
    const actual = await graph.findConnections("private-query-owner", report._id, 1);
    await expect(getConnections(reports, { readPatternSources: graph.readPatternSources.bind(graph), findConnections: async () => actual.map(match => ({ ...match, sharedIdentifiers: ["phone:+12025550199"] })) }, "private-query-owner", report._id)).rejects.toThrow("projection_invalid");
  });
  it("stores recurring actors and harm relationships without turning the answer key into runtime proof", async () => {
    const result = await falkor.selectGraph(`${namespace}_catalogue`).roQuery<{ cases: number; harms: string[] }>(
      "MATCH (a:FictionalActor {id:'victor-morne'})<-[:AUTHORED_ACTOR]-(c:CatalogueCase)-[:HAS_HARM]->(h:HarmCategory) RETURN count(DISTINCT c) AS cases,collect(DISTINCT h.key) AS harms");
    expect(result.data?.[0]?.cases).toBe(5);
    expect(result.data?.[0]?.harms.sort()).toEqual(["bullying", "cybercrime", "fraud", "hate_speech"]);
    const excluded = await falkor.selectGraph(`${namespace}_catalogue`).roQuery<{ actors: number }>(
      "MATCH (c:CatalogueCase) WHERE c.id IN $ids OPTIONAL MATCH (c)-[:AUTHORED_ACTOR]->(a) RETURN count(a) AS actors",
      { params: { ids: [demoCatalogue[37]._id, demoCatalogue[38]._id, demoCatalogue[39]._id] } });
    expect(excluded.data?.[0]?.actors).toBe(0);
    const comparison = await query("The contact was @yama_demo_venue_83.");
    expect(comparison.candidates).toHaveLength(3);
    expect(comparison.candidates.flatMap(candidate => candidate.harmCategories ?? [])).toContain("sexual_molestation");
    expect(comparison.candidates.flatMap(candidate => candidate.harmCategories ?? [])).toContain("bullying");
    expect(JSON.stringify(comparison)).not.toMatch(/fictionalActor|authored_fixture_truth/);
    const aliasCandidates = (await query("The sender displayed the name Victor Morne.")).candidates;
    expect(aliasCandidates.length).toBeGreaterThan(0);
    expect(aliasCandidates.every(candidate => candidate.details?.some(detail => detail.kind === "reported_alias") && !candidate.identifiers?.length && candidate.linkage.status === "not_assessed")).toBe(true);
  });
  it("removes identifier, harm and authored-actor edges when a case is unpublished", async () => {
    const entry = demoCatalogue[25];
    await graph.seedCatalogue([{ ...entry, published: false }]);
    try {
      const result = await falkor.selectGraph(`${namespace}_catalogue`).roQuery<{ edges: number }>(
        "MATCH (c:CatalogueCase {id:$id}) OPTIONAL MATCH (c)-[r]->() RETURN count(r) AS edges", { params: { id: entry._id } });
      expect(result.data?.[0]?.edges).toBe(0);
    } finally { await graph.seedCatalogue([entry]); }
  });
  it("fits a five-case cross-harm reply without dropping matches, source quotes or outcomes", async () => {
    const entry = demoCatalogue[26], owner = demoReporterOwner(entry);
    const report = await reports.get(owner, entry.sourceReportId!);
    const comparison = await getConnections(reports, graph, owner, report._id);
    expect(comparison.candidates).toHaveLength(5);
    const service = new DialogueService(database, mongo), initial = await service.get(owner, report._id);
    await service.change(owner, report._id, { operation: "reply", expectedVersion: initial.version, expectedRevision: report.revision,
      key: randomUUID(), messageId: report.messages.at(-1)!.id, agent: "drishti", language: "en", automatic: false });
    const record = await database.collection<DialogueRecord>("dialogues").findOne({ _id: report._id });
    const context = dialogueContext(report, record!, comparison);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(24000);
    expect(context.comparison?.candidates).toHaveLength(5);
    expect(context.comparison?.candidates.map(candidate => candidate.identifiers)).toEqual(comparison.candidates.map(candidate => candidate.identifiers));
    expect(context.comparison?.candidates.map(candidate => candidate.resolution)).toEqual(comparison.candidates.map(candidate => candidate.resolution));
    expect(context.messages).toEqual(report.messages.map(message => ({ text: message.text })));
    expect(JSON.stringify(context)).not.toMatch(/fictionalActor|authored_fixture_truth/);
    const reply = await runDialogueSnapshot(report, record!, new AbortController().signal, comparison) as { text: string };
    expect(reply.text).toContain("5 matching reports");
  });
  it.each(["synthetic-incidents-v1", "synthetic-incidents-v2"] as const)("upgrades %s without rewriting historical evidence or personal chats", async version => {
    const authored = demoCatalogue[0];
    const legacyId = demoUuid(`${authored._id}:report`, version);
    const legacy = { ...demoSourceReport(authored), _id: legacyId, creationKey: demoUuid(`${authored._id}:create`, version) };
    delete legacy.reporter;
    await database.collection<Report>("reports").insertOne(legacy);
    const evidence = new EvidenceService(database, mongo, files);
    const oldText = Buffer.from("Original authored evidence from the first edition. Preserve these exact bytes.");
    const oldUpload = await evidence.upload(legacy.ownerId, legacy._id, demoUuid(`${authored._id}:legacy-file`, version), "previous-conversation.txt", "text/plain", oldText);
    const current = await database.collection<CatalogueCase>("catalogue").findOne({ _id: authored._id });
    await database.collection<CatalogueCase>("catalogue").replaceOne({ _id: authored._id }, { ...current!, dataset: version, sourceReportId: legacyId });
    const personal = await reports.create("actual-demo-viewer", { synthetic: true, language: "en", narrative: "My existing account should remain unchanged." }, randomUUID());
    const seeded = await seedDemoDataset(database, mongo, graph, files);
    expect(seeded.cases).toBe(40);
    expect(await database.collection("catalogue").countDocuments()).toBe(40);
    expect((await database.collection<CatalogueCase>("catalogue").findOne({ _id: authored._id }))?.dataset).toBe("synthetic-incidents-v3");
    expect(await reports.get("actual-demo-viewer", personal._id)).toEqual(personal);
    expect(await reports.get(legacy.ownerId, legacyId)).toEqual(expect.objectContaining({ _id: legacyId, messages: legacy.messages }));
    expect(await files.read(oldUpload._id)).toEqual(oldText);
  }, 120_000);
});
