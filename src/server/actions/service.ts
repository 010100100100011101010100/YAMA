import "server-only";
import type { ClientSession, Db, MongoClient } from "mongodb";
import { actionReviewInput, type ActionPreview } from "@/lib/actions";
import { ServiceError } from "@/server/errors";
import { parse, type Report } from "@/server/reports/domain";
import type { EvidenceRecord } from "@/server/evidence/service";
import { buildActionPreview } from "./domain";

type ReviewRecord = { _id: string; ownerId: string; reportId: string; revision: number; receipt: string; reviewedAt: Date; preview: ActionPreview };
export class ActionService {
  constructor(private readonly database: Db, private readonly client: MongoClient) {}
  private get reviews() { return this.database.collection<ReviewRecord>("action_reviews"); }
  private async snapshot(ownerId: string, reportId: string, session: ClientSession) {
    const report = await this.database.collection<Report>("reports").findOne({ _id: reportId, ownerId }, { session });
    if (!report) throw new ServiceError(404, "report_not_found");
    const files = await this.database.collection<EvidenceRecord>("evidence").find({ ownerId, reportId, removedAt: null }, { session }).limit(21).toArray();
    const preview = buildActionPreview(report, files.map(file => ({ id: file._id, name: file.name, size: file.size, sha256: file.sha256,
      textSha256: file.extraction?.textSha256 ?? null, format: file.format ?? "text", status: file.status, reviewed: !!file.reviewedMessageId })));
    return { report, files, preview };
  }
  async preview(ownerId: string, reportId: string) {
    return this.client.withSession(session => session.withTransaction(async () => {
      const { preview } = await this.snapshot(ownerId, reportId, session);
      const review = await this.reviews.findOne({ _id: `${reportId}:${preview.receipt}`, ownerId, reportId }, { session });
      return review ? { ...preview, review: { status: "reviewed" as const, reviewedAt: review.reviewedAt.toISOString() } } : preview;
    }, { readConcern: { level: "snapshot" } }));
  }
  async review(ownerId: string, reportId: string, input: unknown) {
    const command = parse(actionReviewInput, input);
    return this.client.withSession(session => session.withTransaction(async () => {
      const { report, files, preview } = await this.snapshot(ownerId, reportId, session);
      if (report.revision !== command.expectedRevision) throw new ServiceError(409, "revision_conflict");
      if (preview.receipt !== command.receipt) throw new ServiceError(409, "preview_changed");
      // Touch the report and the files read above, so concurrent edits, uploads,
      // extraction and archival cause transaction retries before approval commits.
      const fenced = await this.database.collection<Report>("reports").updateOne({ _id: reportId, ownerId, revision: report.revision }, { $inc: { agentTaskFence: 1 } }, { session });
      if (!fenced.matchedCount) throw new ServiceError(409, "revision_conflict");
      if (files.length) await this.database.collection<EvidenceRecord & { actionReviewFence?: number }>("evidence").updateMany({ ownerId, reportId, _id: { $in: files.map(file => file._id) } }, { $inc: { actionReviewFence: 1 } }, { session });
      const id = `${reportId}:${preview.receipt}`;
      const existing = await this.reviews.findOne({ _id: id, ownerId, reportId }, { session });
      const reviewedAt = existing?.reviewedAt ?? new Date();
      const approved = { ...preview, review: { status: "reviewed" as const, reviewedAt: reviewedAt.toISOString() } };
      if (!existing) await this.reviews.insertOne({ _id: id, ownerId, reportId, revision: report.revision, receipt: preview.receipt, reviewedAt, preview: approved }, { session });
      return approved;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } }));
  }
}
