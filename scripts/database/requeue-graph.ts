import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { jobKey, type GraphJob } from "../../src/server/reports/repository";
import type { Report } from "../../src/server/reports/domain";

// Explicit operator command for a graph rebuild or failed-job recovery; no graph/data deletion.
let count = 0;
try {
  const database = getDatabase();
  const reports = database.collection<Report>("reports").find({ $expr: { $eq: ["$revision", "$confirmation.revision"] } });
  for await (const report of reports) {
    const jobs = database.collection<GraphJob>("graph_outbox");
    const job = await jobs.findOne({ _id: jobKey(report), ownerId: report.ownerId });
    if (job?.status === "processing" && job.leaseUntil && job.leaseUntil > new Date()) continue;
    const queued = await jobs.updateOne({ _id: jobKey(report), ownerId: report.ownerId,
      $or: [{ status: { $ne: "processing" } }, { leaseUntil: { $lte: new Date() } }] }, {
      $set: { status: "pending", attempts: 0, dueAt: new Date(), leaseUntil: null, claimToken: null, errorCode: null },
    });
    count += queued.modifiedCount;
  }
  console.log(`Requeued ${count} current confirmed revisions. Run worker:graph to rebuild their projections.`);
} catch { console.error("Graph requeue failed: database_unavailable"); process.exitCode = 1; }
finally { await getMongoClient().close(); }
