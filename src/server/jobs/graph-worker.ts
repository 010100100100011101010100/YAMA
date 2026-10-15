import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import type { GraphStore } from "@/server/database/graph";
import type { Report } from "@/server/reports/domain";
import { revisionKey, type GraphJob, type Revision } from "@/server/reports/repository";

export class GraphWorker {
  constructor(private database: Db, private graph: Pick<GraphStore, "project">) {}
  async runOnce() {
    const now = new Date();
    const token = randomUUID();
    const jobs = this.database.collection<GraphJob>("graph_outbox");
    const job = await jobs.findOneAndUpdate({ $or: [
      { status: "pending", dueAt: { $lte: now } },
      { status: "processing", leaseUntil: { $lte: now } },
    ] }, { $set: { status: "processing", claimToken: token, leaseUntil: new Date(now.getTime() + 30_000) }, $inc: { attempts: 1 } }, { sort: { dueAt: 1 }, returnDocument: "after" });
    if (!job) return false;
    const owned = { _id: job._id, claimToken: token, status: "processing" as const };
    const current = () => this.database.collection<Report>("reports").findOne({ _id: job.reportId, ownerId: job.ownerId, revision: job.revision, "confirmation.revision": job.revision });
    try {
      if (job.attempts > 5) throw new Error("retry_limit");
      const report = await current();
      if (!report) {
        await jobs.updateOne(owned, { $set: { status: "superseded", claimToken: null, leaseUntil: null } });
        return true;
      }
      const revision = await this.database.collection<Revision>("report_revisions").findOne({ _id: revisionKey(report, "confirmed"), ownerId: job.ownerId });
      if (!revision) throw new Error("snapshot_missing");
      await this.graph.project(revision.snapshot);
      const status = await current() ? "done" : "superseded";
      await jobs.updateOne(owned, { $set: { status, claimToken: null, leaseUntil: null, errorCode: null } });
    } catch {
      await jobs.updateOne(owned, { $set: { status: job.attempts >= 5 ? "failed" : "pending", claimToken: null, leaseUntil: null,
        dueAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** job.attempts)), errorCode: "projection_failed" } });
    }
    return true;
  }
}
