import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { MongoServerError, type Db, type MongoClient } from "mongodb";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
import { addEvidenceNote, parse, type Report } from "@/server/reports/domain";
import { ReportRepository, revisionKey, type Revision } from "@/server/reports/repository";
import { EvidenceFiles } from "./files";
import { extractText, inspectUpload } from "./domain";
import type { EvidenceFormat } from "@/lib/evidence-format";
import { extractionSchema, type EvidenceExtraction } from "@/lib/evidence-extraction";

export type EvidenceRecord = {
  _id: string; ownerId: string; reportId: string; uploadKey: string; name: string; size: number; sha256: string;
  status: "stored" | "queued" | "processing" | "ready" | "failed" | "canceled"; errorCode: string | null; text: string | null; extractor: "utf8-v1" | "local-doc-v1";
  format?: EvidenceFormat; extraction?: EvidenceExtraction | null; attempts?: number; claimToken?: string | null; leaseUntil?: Date | null; requestedAt?: Date;
  createdRevision: number; reviewedMessageId: string | null; createdAt: Date; removedAt: Date | null;
};
export function publicEvidence(file: EvidenceRecord) {
  return { id: file._id, reportId: file.reportId, name: file.name, size: file.size, sha256: file.sha256,
    status: file.status, format: file.format ?? "text", attempts: file.attempts ?? 0, errorCode: file.errorCode, reviewed: !!file.reviewedMessageId };
}
export const reviewInput = z.strictObject({ expectedRevision: z.number().int().positive(), acknowledged: z.literal(true), sha256: z.string().regex(/^[a-f0-9]{64}$/), textSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export class EvidenceService {
  private readonly reports: ReportRepository;
  constructor(readonly database: Db, private readonly client: MongoClient, readonly files: EvidenceFiles) {
    this.reports = new ReportRepository(database, client);
  }
  private get records() { return this.database.collection<EvidenceRecord>("evidence"); }
  async get(ownerId: string, reportId: string, id: string) {
    await this.reports.get(ownerId, reportId);
    const record = await this.records.findOne({ _id: id, ownerId, reportId, removedAt: null });
    if (!record) throw new ServiceError(404, "evidence_not_found");
    return record;
  }
  async list(ownerId: string, reportId: string) {
    await this.reports.get(ownerId, reportId);
    return (await this.records.find({ ownerId, reportId, removedAt: null }).sort({ createdAt: 1 }).limit(20).toArray()).map(publicEvidence);
  }
  async upload(ownerId: string, reportId: string, uploadKey: string, name: string, type: string, bytes: Buffer) {
    await this.reports.get(ownerId, reportId);
    const inspected = inspectUpload(name, type, bytes);
    const reuse = (record: EvidenceRecord, keyed: boolean) => {
      if (keyed && (record.sha256 !== inspected.sha256 || record.name !== name)) throw new ServiceError(409, "idempotency_conflict");
      if (record.removedAt) throw new ServiceError(409, "evidence_removed");
      return record;
    };
    const existing = await this.records.findOne({ ownerId, reportId, uploadKey });
    if (existing) return reuse(existing, true);
    const duplicate = await this.records.findOne({ ownerId, reportId, sha256: inspected.sha256 });
    if (duplicate) return reuse(duplicate, false);
    const id = randomUUID(); await this.files.write(id, bytes);
    let saved: EvidenceRecord;
    try {
      saved = await this.client.withSession(session => session.withTransaction(async () => {
        // Key conflicts take precedence over content deduplication, including after a transaction retry.
        const already = await this.records.findOne({ ownerId, reportId, uploadKey }, { session });
        if (already) return reuse(already, true);
        const sameContent = await this.records.findOne({ ownerId, reportId, sha256: inspected.sha256 }, { session });
        if (sameContent) return reuse(sameContent, false);
        const current = await this.database.collection<Report>("reports").findOne({ _id: reportId, ownerId }, { session });
        if (!current) throw new ServiceError(404, "report_not_found");
        const slot = await this.database.collection<Report>("reports").updateOne({ _id: reportId, ownerId,
          $or: [{ evidenceCount: { $exists: false } }, { evidenceCount: { $lt: 20 } }] }, { $inc: { evidenceCount: 1 } }, { session });
        if (!slot.matchedCount) throw new ServiceError(422, "evidence_limit");
        const record: EvidenceRecord = { _id: id, ownerId, reportId, uploadKey, ...inspected, status: "stored", errorCode: null, text: null,
          extractor: inspected.format === "text" ? "utf8-v1" : "local-doc-v1", extraction: null, attempts: 0, claimToken: null, leaseUntil: null,
          createdRevision: current.revision, reviewedMessageId: null, createdAt: new Date(), removedAt: null };
        await this.records.insertOne(record, { session }); return record;
      }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } }));
    } catch (error) {
      // Files and Mongo cannot commit atomically. Keep bytes if commit outcome cannot be read.
      const committed = await this.records.findOne({ _id: id }).catch(() => undefined);
      if (committed) return committed;
      if (committed === null) await this.files.discard(id).catch(() => undefined);
      if (error instanceof MongoServerError && error.code === 11000) {
        const concurrent = await this.records.findOne({ ownerId, reportId, uploadKey });
        if (concurrent) return reuse(concurrent, true);
        const sameContent = await this.records.findOne({ ownerId, reportId, sha256: inspected.sha256 });
        if (sameContent) return reuse(sameContent, false);
      }
      throw error;
    }
    if (saved._id !== id) await this.files.discard(id).catch(() => undefined);
    return saved;
  }
  private async read(record: EvidenceRecord) {
    const bytes = await this.files.read(record._id);
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256) throw new ServiceError(409, "integrity_failed");
    return bytes;
  }
  async content(ownerId: string, reportId: string, id: string) {
    const record = await this.get(ownerId, reportId, id);
    if (!["png", "jpeg"].includes(record.format ?? "")) throw new ServiceError(415, "unsupported_file_type");
    const bytes = await this.read(record);
    await this.get(ownerId, reportId, id); // A concurrent removal revokes the preview.
    return { bytes, type: record.format === "png" ? "image/png" : "image/jpeg" };
  }
  async extract(ownerId: string, reportId: string, id: string) {
    const record = await this.get(ownerId, reportId, id);
    if (record.extractor === "local-doc-v1") {
      if (["ready", "queued", "processing"].includes(record.status)) return record;
      if ((record.attempts ?? 0) >= 3) throw new ServiceError(422, "retry_limit");
      const queued = await this.records.findOneAndUpdate({ _id: id, ownerId, reportId, removedAt: null, status: { $in: ["stored", "failed", "canceled"] }, attempts: { $lt: 3 } },
        { $set: { status: "queued", requestedAt: new Date(), errorCode: null, claimToken: null, leaseUntil: null } }, { returnDocument: "after" });
      return queued ?? this.get(ownerId, reportId, id);
    }
    let text: string | null = null, errorCode: string | null = null;
    try { text = extractText(await this.read(record)); }
    catch (error) { errorCode = error instanceof ServiceError ? error.code : "extraction_failed"; }
    const saved = await this.records.findOneAndUpdate({ _id: id, ownerId, reportId, removedAt: null },
      { $set: { text, status: errorCode ? "failed" : "ready", errorCode } }, { returnDocument: "after" });
    if (!saved) throw new ServiceError(404, "evidence_not_found");
    return saved;
  }
  async source(ownerId: string, reportId: string, id: string) {
    const record = await this.get(ownerId, reportId, id);
    if (record.status !== "ready") throw new ServiceError(409, "text_not_ready");
    const bytes = await this.read(record);
    if (record.extractor === "utf8-v1") return { evidenceId: id, name: record.name, sha256: record.sha256, text: extractText(bytes) };
    const extraction = extractionSchema.safeParse(record.extraction);
    if (!extraction.success || !record.text || createHash("sha256").update(record.text).digest("hex") !== extraction.data.textSha256
      || extraction.data.pages.at(-1)!.end !== record.text.length) throw new ServiceError(409, "integrity_failed");
    return { evidenceId: id, name: record.name, sha256: record.sha256, text: record.text, extraction: extraction.data };
  }
  async review(ownerId: string, reportId: string, id: string, input: unknown) {
    const approval = parse(reviewInput, input);
    const source = await this.source(ownerId, reportId, id);
    if (source.sha256 !== approval.sha256) throw new ServiceError(409, "source_changed");
    if (source.extraction && source.extraction.textSha256 !== approval.textSha256) throw new ServiceError(409, "source_changed");
    return this.client.withSession(session => session.withTransaction(async () => {
      const file = await this.records.findOne({ _id: id, ownerId, reportId, removedAt: null, status: "ready", sha256: approval.sha256 }, { session });
      if (!file) throw new ServiceError(404, "evidence_not_found");
      if (source.extraction && file.extraction?.textSha256 !== source.extraction.textSha256) throw new ServiceError(409, "source_changed");
      const current = await this.database.collection<Report>("reports").findOne({ _id: reportId, ownerId }, { session });
      if (!current) throw new ServiceError(404, "report_not_found");
      if (current.messages.some(message => message.evidenceSource?.evidenceId === id)) return current;
      const next = addEvidenceNote(current, source, approval.expectedRevision);
      await this.records.updateOne({ _id: id, ownerId, reportId, removedAt: null }, { $set: { reviewedMessageId: next.messages.at(-1)!.id } }, { session });
      const written = await this.database.collection<Report>("reports").replaceOne({ _id: reportId, ownerId, revision: current.revision }, next, { session });
      if (!written.matchedCount) throw new ServiceError(409, "revision_conflict");
      await this.database.collection<Revision>("report_revisions").insertOne({ _id: revisionKey(next, "draft"), ownerId, reportId, revision: next.revision, kind: "draft", snapshot: next }, { session });
      return next;
    }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } }));
  }
  async remove(ownerId: string, reportId: string, id: string) {
    await this.reports.get(ownerId, reportId);
    const removed = await this.records.updateOne({ _id: id, ownerId, reportId }, { $set: { removedAt: new Date(), claimToken: null, leaseUntil: null } });
    if (!removed.matchedCount) throw new ServiceError(404, "evidence_not_found");
  }
  async cancel(ownerId: string, reportId: string, id: string) {
    await this.get(ownerId, reportId, id);
    const canceled = await this.records.findOneAndUpdate({ _id: id, ownerId, reportId, removedAt: null, status: { $in: ["queued", "processing"] } },
      { $set: { status: "canceled", claimToken: null, leaseUntil: null, errorCode: null } }, { returnDocument: "after" });
    return canceled ?? this.get(ownerId, reportId, id);
  }
}
