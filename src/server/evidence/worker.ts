import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { ServiceError } from "@/server/errors";
import { EvidenceFiles } from "./files";
import { parseDocument, type DocumentParser } from "./document-runtime";
import type { EvidenceRecord } from "./service";
import type { Report } from "@/server/reports/domain";

type ParserLock = { _id: string; claimToken: string | null; leaseUntil: Date };
export class EvidenceWorker {
  constructor(private readonly database: Db, private readonly files: EvidenceFiles, private readonly parser: DocumentParser = parseDocument) {}
  async runOnce(signal: AbortSignal = new AbortController().signal) {
    if (signal.aborted) return false;
    const token = randomUUID(), now = new Date(), leaseUntil = new Date(now.getTime() + 90_000);
    const locks = this.database.collection<ParserLock>("evidence_worker_lock"), records = this.database.collection<EvidenceRecord>("evidence");
    const lock = await locks.findOneAndUpdate({ _id: "parser", leaseUntil: { $lte: now } }, { $set: { claimToken: token, leaseUntil } }, { returnDocument: "after" });
    if (!lock) return false;
    let monitor: ReturnType<typeof setInterval> | undefined;
    const canceled = new AbortController();
    try {
      const file = await records.findOneAndUpdate({ removedAt: null, extractor: "local-doc-v1", $or: [{ status: "queued" }, { status: "processing", leaseUntil: { $lte: now } }] },
        { $set: { status: "processing", claimToken: token, leaseUntil }, $inc: { attempts: 1 } }, { sort: { requestedAt: 1 }, returnDocument: "after" });
      if (!file) return false;
      const claim = { _id: file._id, ownerId: file.ownerId, reportId: file.reportId, sha256: file.sha256, removedAt: null, status: "processing" as const, claimToken: token };
      let checking = false;
      monitor = setInterval(() => {
        if (checking || canceled.signal.aborted) return;
        checking = true;
        records.findOne(claim, { projection: { _id: 1 } }).then(current => { if (!current) canceled.abort(); }).catch(() => canceled.abort()).finally(() => { checking = false; });
      }, 1000);
      try {
        if ((file.attempts ?? 0) > 3) throw new ServiceError(422, "retry_limit");
        if (!await this.database.collection<Report>("reports").findOne({ _id: file.reportId, ownerId: file.ownerId }, { projection: { _id: 1 } })) throw new ServiceError(404, "report_not_found");
        const bytes = await this.files.read(file._id);
        if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new ServiceError(409, "integrity_failed");
        if (!file.format || file.format === "text") throw new ServiceError(422, "unsupported_file_type");
        const output = await this.parser(bytes, file.format, AbortSignal.any([signal, canceled.signal]));
        if (signal.aborted || canceled.signal.aborted) throw new ServiceError(409, "processing_canceled");
        await records.updateOne(claim, { $set: { ...output, status: "ready", errorCode: null, claimToken: null, leaseUntil: null } });
      } catch (error) {
        await records.updateOne(claim, { $set: { status: "failed", errorCode: signal.aborted ? "processing_interrupted" : error instanceof ServiceError ? error.code : "processing_failed", text: null, extraction: null, claimToken: null, leaseUntil: null } });
      }
      return true;
    } finally {
      if (monitor) clearInterval(monitor);
      await locks.updateOne({ _id: "parser", claimToken: token }, { $set: { claimToken: null, leaseUntil: new Date(0) } });
    }
  }
}
