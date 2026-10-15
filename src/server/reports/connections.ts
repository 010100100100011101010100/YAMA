import "server-only";
import type { GraphStore, CatalogueCase } from "@/server/database/graph";
import { ServiceError } from "@/server/errors";
import { matchingPatterns } from "./domain";
import { jobKey, type GraphJob, type ReportRepository } from "./repository";
import { CONNECTION_RECIPE, connectionsSchema, type ConnectionsResult } from "@/lib/connections";
import { explainPatternSources } from "./connection-explanation";
import { catalogueVersion } from "./catalogue-policy";

export async function getConnections(repository: ReportRepository, graph: Pick<GraphStore, "findConnections" | "readPatternSources">, ownerId: string, id: string): Promise<ConnectionsResult> {
  const report = await repository.get(ownerId, id);
  if (report.confirmation?.revision !== report.revision) throw new ServiceError(409, "confirmation_required");
  const job = await repository.database.collection<GraphJob>("graph_outbox").findOne({ _id: jobKey(report), ownerId });
  if (job?.status === "failed") throw new ServiceError(503, "projection_failed");
  if (job?.status !== "done") return { status: "pending", reportId: id, revision: report.revision, recipe: CONNECTION_RECIPE, sources: [], candidates: [] };
  const matches = await graph.findConnections(ownerId, id, report.revision);
  const sources = explainPatternSources(report);
  const patterns = matchingPatterns(report);
  const paths = await graph.readPatternSources(ownerId, id, report.revision);
  // Mongo is canonical. A missing, duplicated or altered graph path cannot be cited.
  if (paths.length !== sources.length || new Set(paths.map(path => path.assertionId)).size !== paths.length || sources.some(source => {
    const path = paths.find(path => path.assertionId === source.assertionId);
    return !path || path.traversable !== patterns.includes(source.value) || path.value !== source.value || path.originalValue !== source.originalValue || path.origin !== source.origin || path.included !== source.included || path.polarity !== source.polarity
      || path.messageId !== source.source.messageId || path.start !== source.source.start || path.end !== source.source.end
      || path.evidenceId !== (source.evidence?.id ?? "") || path.sha256 !== (source.evidence?.sha256 ?? "") || path.textSha256 !== (source.evidence?.textSha256 ?? "");
  })) throw new ServiceError(503, "projection_invalid");
  const entries = await repository.database.collection<CatalogueCase>("catalogue").find({ _id: { $in: matches.map(match => match.id) }, synthetic: true, published: true }).toArray();
  // An edit while FalkorDB was answering must not expose results for the old revision.
  const latest = await repository.get(ownerId, id);
  if (latest.revision !== report.revision || latest.confirmation?.revision !== report.revision) throw new ServiceError(409, "revision_conflict");
  const items = report.assertions.filter(assertion => assertion.included && assertion.polarity === "affirmed" && assertion.field === "item");
  return connectionsSchema.parse({ status: "ready", reportId: id, revision: report.revision, recipe: CONNECTION_RECIPE, sources,
    candidates: matches.flatMap(match => {
      const entry = entries.find(entry => entry._id === match.id);
      if (!entry) return [];
      if (match.version !== catalogueVersion(entry)) throw new ServiceError(503, "catalogue_changed");
      const shared = patterns.filter(key => match.sharedPatterns.includes(key) && entry.patterns.some(pattern => pattern === key));
      if (!shared.length || shared.length !== new Set(match.sharedPatterns).size) throw new ServiceError(503, "projection_invalid");
      return [{ id: entry._id, title: entry.title, summary: entry.summary, synthetic: true,
        pattern: { shared, different: entry.patterns.filter(key => !patterns.includes(key)), basis: "confirmed_pattern_tags" },
        linkage: { status: "not_assessed", explanation: "A shared pattern does not establish a shared person or organization." },
        explanation: { catalogueVersion: match.version, sourceKind: "authored_synthetic", paths: shared.map(pattern => ({ pattern,
          assertionIds: sources.filter(source => source.value === pattern && source.status === "supporting").map(source => source.assertionId) })) },
        differences: items.length && !items.some(item => item.value.toLowerCase() === entry.item) ? ["The reported item differs from this fictional example."] : [],
      }];
    }),
  });
}
