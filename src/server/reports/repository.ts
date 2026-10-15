import "server-only";
import { MongoServerError, type ClientSession, type Db, type MongoClient } from "mongodb";
import { ServiceError } from "@/server/errors";
import { confirmReport, createInput, createReport, creationHash, parse, reviseReport, type Report } from "./domain";

export type Revision = { _id: string; ownerId: string; reportId: string; revision: number; kind: "draft" | "confirmed"; snapshot: Report };
export type GraphJob = {
  _id: string; ownerId: string; reportId: string; revision: number;
  status: "pending" | "processing" | "done" | "superseded" | "failed";
  attempts: number; dueAt: Date; leaseUntil: Date | null; claimToken: string | null; errorCode: string | null;
};
export const revisionKey = (report: Pick<Report, "_id" | "revision">, kind: Revision["kind"]) => `${report._id}:${report.revision}:${kind}`;
export const jobKey = (report: Pick<Report, "_id" | "revision">) => `${report._id}:${report.revision}`;

export class ReportRepository {
  constructor(readonly database: Db, private readonly client: MongoClient) {}
  private get reports() { return this.database.collection<Report>("reports"); }
  private async saveRevision(report: Report, kind: Revision["kind"], session: ClientSession) {
    await this.database.collection<Revision>("report_revisions").insertOne({ _id: revisionKey(report, kind), ownerId: report.ownerId, reportId: report._id, revision: report.revision, kind, snapshot: report }, { session });
  }
  async create(ownerId: string, input: unknown, idempotencyKey: string) {
    const parsed = parse(createInput, input);
    const existing = await this.reports.findOne({ ownerId, creationKey: idempotencyKey });
    const reuse = (report: Report) => {
      if (report.creationHash !== creationHash(parsed)) throw new ServiceError(409, "idempotency_conflict");
      return report;
    };
    if (existing) return reuse(existing);
    const report = createReport(ownerId, parsed, idempotencyKey);
    try {
      await this.client.withSession(session => session.withTransaction(async () => {
        await this.reports.insertOne(report, { session });
        await this.saveRevision(report, "draft", session);
      }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } }));
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const concurrent = await this.reports.findOne({ ownerId, creationKey: idempotencyKey });
      if (!concurrent) throw error;
      return reuse(concurrent);
    }
    return report;
  }
  async get(ownerId: string, id: string) {
    const report = await this.reports.findOne({ _id: id, ownerId });
    if (!report) throw new ServiceError(404, "report_not_found");
    return report;
  }
  async list(ownerId: string) {
    return this.reports.find({ ownerId }, { projection: { _id: 1, revision: 1, language: 1, confirmation: 1, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(50).toArray();
  }
  private async change(ownerId: string, id: string, input: unknown, kind: "draft" | "confirmed") {
    return this.client.withSession(session => session.withTransaction(async () => {
      const current = await this.reports.findOne({ _id: id, ownerId }, { session });
      if (!current) throw new ServiceError(404, "report_not_found");
      const next = kind === "confirmed" ? confirmReport(current, input) : reviseReport(current, input);
      if (next === current) return current;
      const written = await this.reports.replaceOne({ _id: id, ownerId, revision: current.revision }, next, { session });
      if (written.matchedCount !== 1) throw new ServiceError(409, "revision_conflict");
      await this.saveRevision(next, kind, session);
      if (kind === "confirmed") {
        await this.database.collection<GraphJob>("graph_outbox").insertOne({ _id: jobKey(next), ownerId, reportId: id, revision: next.revision,
          status: "pending", attempts: 0, dueAt: new Date(), leaseUntil: null, claimToken: null, errorCode: null }, { session });
      }
      return next;
    }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } }));
  }
  revise(ownerId: string, id: string, input: unknown) { return this.change(ownerId, id, input, "draft"); }
  confirm(ownerId: string, id: string, input: unknown) { return this.change(ownerId, id, input, "confirmed"); }
}
