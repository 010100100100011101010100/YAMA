import "server-only";
import { createHash } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import sharp from "sharp";
import type { GraphStore } from "@/server/database/graph";
import { EvidenceService, type EvidenceRecord } from "@/server/evidence/service";
import { EvidenceFiles } from "@/server/evidence/files";
import type { Report } from "./domain";
import { catalogueSchema, type CatalogueCase } from "./catalogue-policy";
import { demoCatalogue, demoDatasetVersion, demoSourceReport, demoUuid } from "./demo-cases";
import { ReportRepository, jobKey, revisionKey, type GraphJob, type Revision } from "./repository";

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const wrap = (value: string) => value.split("\n").flatMap(line => line.match(/.{1,78}(?:\s|$)|.{1,78}/g) ?? [""]);
export async function demoEvidenceImage(entry: CatalogueCase) {
  const lines = ["YAMA / FICTIONAL CONVERSATION RECORD", ...wrap(entry.title), "Invented characters and events. Authored text, not OCR.", "", ...wrap(entry.story!), "", "FOLLOW-UP", ...wrap(entry.resolution!.summary)];
  const height = 100 + lines.length * 25;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}"><rect width="1000" height="${height}" fill="#f6f3eb"/><rect x="0" width="12" height="${height}" fill="#23734d"/>${lines.map((line, index) => `<text x="36" y="${55 + index * 25}" fill="#1b2420" font-family="monospace" font-size="18">${xml(line)}</text>`).join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// The catalogue is an explicit shared SYNTHETIC publication. Source reports/evidence retain per-reporter ownership.
// Reruns reuse source IDs and upload idempotency keys; they never reset a user's reports or database.
export async function seedDemoDataset(database: Db, client: MongoClient, graph: GraphStore, files: EvidenceFiles) {
  const evidence = new EvidenceService(database, client, files);
  const reports = new ReportRepository(database, client);
  const seeded: CatalogueCase[] = [];
  for (const authored of demoCatalogue) {
    const previous = await database.collection<CatalogueCase>("catalogue").findOne({ _id: authored._id });
    // A new edition may replace only our own published fixture; immutable source files remain intact.
    if (previous && (!catalogueSchema.safeParse(previous).success || !previous.dataset
      || previous.sourceReportId !== demoUuid(`${authored._id}:report`, previous.dataset))) throw new Error("demo_seed_collision");
    const source = demoSourceReport(authored);
    const existing = await database.collection<Report>("reports").findOne({ _id: source._id });
    if (existing && (existing.ownerId !== source.ownerId || !existing.synthetic || existing.creationKey !== source.creationKey)) throw new Error("demo_seed_collision");
    await database.collection<Report>("reports").updateOne({ _id: source._id, ownerId: source.ownerId }, { $setOnInsert: source }, { upsert: true });
    await database.collection<Revision>("report_revisions").updateOne({ _id: revisionKey(source, "confirmed") }, { $setOnInsert: { _id: revisionKey(source, "confirmed"), ownerId: source.ownerId, reportId: source._id, revision: source.revision, kind: "confirmed", snapshot: source } }, { upsert: true });
    const filename = authored.reporter!.name.toLowerCase().replaceAll(" ", "-");
    const png = await evidence.upload(source.ownerId, source._id, demoUuid(`${authored._id}:png-upload`), `${filename}-conversation.png`, "image/png", await demoEvidenceImage(authored));
    const transcript = await evidence.upload(source.ownerId, source._id, demoUuid(`${authored._id}:text-upload`), `${filename}-conversation.txt`, "text/plain", Buffer.from(`Conversation record: ${authored.reporter!.name}\nAuthored demonstration transcript; not OCR.\n\n${authored.story}\n\nFollow-up\n${authored.resolution!.summary}`));
    const extracted = await evidence.extract(source.ownerId, source._id, transcript._id);
    let report = await reports.get(source.ownerId, source._id);
    report = await evidence.review(source.ownerId, source._id, transcript._id, { expectedRevision: report.revision, acknowledged: true, sha256: extracted.sha256 });
    report = await reports.confirm(source.ownerId, source._id, { expectedRevision: report.revision, acknowledged: true });
    await graph.project(report);
    await database.collection<GraphJob>("graph_outbox").updateOne({ _id: jobKey(report), ownerId: report.ownerId }, { $set: { status: "done", errorCode: null, leaseUntil: null, claimToken: null },
      $setOnInsert: { reportId: report._id, revision: report.revision, attempts: 0, dueAt: report.updatedAt } }, { upsert: true });
    await database.collection<{ _id: string; ownerId: string; resolution: string; version: number; updatedAt: Date }>("chat_statuses").updateOne({ _id: report._id, ownerId: report.ownerId },
      { $setOnInsert: { resolution: authored.resolution!.status === "resolved" ? "resolved" : "unresolved", version: 1, updatedAt: report.updatedAt } }, { upsert: true });
    const entries: EvidenceRecord[] = [png, transcript];
    const entry = catalogueSchema.parse({ ...authored, sourceReportId: report._id,
      evidence: entries.map(file => ({ id: file._id, name: file.name, format: file.format, sha256: file.sha256 })) });
    await database.collection<CatalogueCase>("catalogue").replaceOne({ _id: entry._id }, entry, { upsert: true });
    seeded.push(entry);
  }
  await graph.seedCatalogue(seeded);
  return { dataset: demoDatasetVersion, cases: seeded.length, images: seeded.reduce((sum, entry) => sum + entry.evidence!.filter(file => file.format === "png").length, 0),
    transcriptions: seeded.length, fingerprint: createHash("sha256").update(JSON.stringify(seeded)).digest("hex") };
}
