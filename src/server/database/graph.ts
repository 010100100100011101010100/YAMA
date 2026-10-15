import "server-only";
import { createHash } from "node:crypto";
import { Graph } from "falkordb";
import { connectGraph, type GraphClient } from "./graph-client";
import { getServerConfig } from "@/server/config";
import { matchingPatterns, type Report } from "@/server/reports/domain";
import { catalogueSchema, catalogueVersion, type CatalogueCase } from "@/server/reports/catalogue-policy";
export type { CatalogueCase } from "@/server/reports/catalogue-policy";

const shared = globalThis as typeof globalThis & { yamaGraph?: Promise<GraphClient> };
export async function getGraphClient(): Promise<GraphClient> {
  if (!shared.yamaGraph) {
    const config = getServerConfig();
    shared.yamaGraph = connectGraph(config.graphHost, config.graphPort, config.graphPassword)
      .catch(() => { shared.yamaGraph = undefined; throw new Error("graph_unavailable"); });
  }
  const client = await shared.yamaGraph;
  if (client.isReady()) return client;
  shared.yamaGraph = undefined;
  return getGraphClient();
}
export function privateGraphName(database: string, ownerId: string) {
  return `${database}_private_${createHash("sha256").update(ownerId).digest("hex").slice(0, 32)}`;
}

export class GraphStore {
  constructor(readonly client: GraphClient, readonly namespace: string) {}
  private async ensureIndex(graph: Graph, label: string, property: string) {
    try { await graph.createNodeRangeIndex(label, property); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== `Attribute '${property}' is already indexed`) throw error;
    }
  }
  private privateGraph(ownerId: string) { return this.client.selectGraph(privateGraphName(this.namespace, ownerId)); }
  private get catalogueGraph() { return this.client.selectGraph(`${this.namespace}_catalogue`); }
  async project(report: Report) {
    if (report.confirmation?.revision !== report.revision) throw new Error("unconfirmed_projection");
    const graph = this.privateGraph(report.ownerId);
    await this.ensureIndex(graph, "ReportSnapshot", "key");
    // Immutable revision keys make retries and late workers harmless to newer revisions.
    await graph.query(`MERGE (r:ReportSnapshot {key: $key}) SET r.reportId = $reportId, r.revision = $revision, r.confirmation = 'user_confirmed'
      WITH r UNWIND $assertions AS assertion
      MERGE (a:Assertion {key: assertion.key}) SET a.assertionId = assertion.id, a.field = assertion.field, a.value = assertion.value,
        a.originalValue = assertion.originalValue, a.included = assertion.included, a.polarity = assertion.polarity, a.origin = assertion.origin
      MERGE (r)-[:HAS_ASSERTION]->(a)
      MERGE (s:SourceRange {key: assertion.key}) SET s.messageId = assertion.messageId, s.start = assertion.start, s.end = assertion.end,
        s.sourceKind = assertion.sourceKind, s.evidenceId = assertion.evidenceId, s.sha256 = assertion.sha256,
        s.textSha256 = assertion.textSha256, s.extraction = assertion.extraction
      MERGE (a)-[:SOURCED_FROM]->(s)`, {
      TIMEOUT: 3000, params: { key: `${report._id}:${report.revision}`, reportId: report._id, revision: report.revision,
        assertions: report.assertions.map(assertion => ({ key: `${report._id}:${report.revision}:${assertion.id}`, id: assertion.id,
          field: assertion.field, value: assertion.value, originalValue: assertion.originalValue, included: assertion.included,
          polarity: assertion.polarity, origin: assertion.origin, messageId: assertion.source.messageId, start: assertion.source.start, end: assertion.source.end,
          sourceKind: report.messages.find(message => message.id === assertion.source.messageId)?.evidenceSource ? "evidence" : "message",
          evidenceId: report.messages.find(message => message.id === assertion.source.messageId)?.evidenceSource?.evidenceId ?? "",
          sha256: report.messages.find(message => message.id === assertion.source.messageId)?.evidenceSource?.sha256 ?? "",
          textSha256: report.messages.find(message => message.id === assertion.source.messageId)?.evidenceSource?.extraction?.textSha256 ?? "",
          extraction: JSON.stringify(report.messages.find(message => message.id === assertion.source.messageId)?.evidenceSource?.extraction ?? null) })) },
    });
    await graph.query(`MATCH (r:ReportSnapshot {key: $key}) WITH r UNWIND $patterns AS key
      MERGE (p:Pattern {key: key}) MERGE (r)-[:HAS_PATTERN]->(p)`, {
      TIMEOUT: 3000, params: { key: `${report._id}:${report.revision}`, patterns: matchingPatterns(report) },
    });
  }
  async seedCatalogue(cases: CatalogueCase[]) {
    await this.ensureIndex(this.catalogueGraph, "CatalogueCase", "id");
    // Only explicit synthetic fixtures enter this shared graph. No report projection uses it.
    for (const entry of cases) {
      catalogueSchema.parse(entry);
      await this.catalogueGraph.query(`MERGE (c:CatalogueCase {id: $id}) SET c.synthetic = true, c.published = $published, c.contentVersion = $version
        WITH c OPTIONAL MATCH (c)-[old:HAS_PATTERN]->() DELETE old
        WITH DISTINCT c UNWIND $patterns AS key MERGE (p:Pattern {key: key}) MERGE (c)-[:HAS_PATTERN]->(p)`, {
        TIMEOUT: 3000, params: { id: entry._id, patterns: entry.published ? entry.patterns : [], published: entry.published, version: catalogueVersion(entry) },
      });
    }
  }
  async findConnections(ownerId: string, reportId: string, revision: number) {
    const snapshot = await this.privateGraph(ownerId).roQuery<{ patterns: string[]; snapshots: number }>(
      "MATCH (r:ReportSnapshot {key: $key}) OPTIONAL MATCH (r)-[:HAS_PATTERN]->(p:Pattern) RETURN count(DISTINCT r) AS snapshots, collect(p.key) AS patterns",
      { TIMEOUT: 3000, params: { key: `${reportId}:${revision}` } },
    ).catch(error => {
      if (error instanceof Error && error.message === "ERR Invalid graph operation on empty key") throw new Error("projection_missing");
      throw error;
    });
    if (snapshot.data?.[0]?.snapshots !== 1) throw new Error("projection_missing");
    const patterns = snapshot.data[0].patterns;
    if (!patterns.length) return [];
    const candidates = await this.catalogueGraph.roQuery<{ id: string; version: string; sharedPatterns: string[] }>(
      `MATCH (c:CatalogueCase)-[:HAS_PATTERN]->(p:Pattern) WHERE c.synthetic = true AND c.published = true AND p.key IN $patterns
       RETURN c.id AS id, c.contentVersion AS version, collect(DISTINCT p.key) AS sharedPatterns ORDER BY size(sharedPatterns) DESC, id LIMIT 10`,
      { TIMEOUT: 3000, params: { patterns } },
    );
    return candidates.data ?? [];
  }
  async readPatternSources(ownerId: string, reportId: string, revision: number) {
    const paths = await this.privateGraph(ownerId).roQuery<GraphPatternSource>(
      `MATCH (r:ReportSnapshot {key: $key})-[:HAS_ASSERTION]->(a:Assertion)-[:SOURCED_FROM]->(s:SourceRange)
       WHERE a.field = 'pattern' OPTIONAL MATCH (r)-[:HAS_PATTERN]->(p:Pattern) WHERE p.key = a.value
       RETURN a.assertionId AS assertionId, a.value AS value, a.originalValue AS originalValue, a.origin AS origin,
       a.included AS included, a.polarity AS polarity, s.messageId AS messageId, s.start AS start, s.end AS end,
       s.evidenceId AS evidenceId, s.sha256 AS sha256, s.textSha256 AS textSha256, count(p) > 0 AS traversable LIMIT 101`,
      { TIMEOUT: 3000, params: { key: `${reportId}:${revision}` } });
    return paths.data ?? [];
  }
}

export type GraphPatternSource = { assertionId: string; value: string; originalValue: string; origin: string; included: boolean; polarity: string;
  messageId: string; start: number; end: number; evidenceId: string; sha256: string; textSha256: string; traversable: boolean };
export const syntheticCatalogue: CatalogueCase[] = [
  { _id: "synthetic-delivery-01", synthetic: true, published: true, title: "Paid order that did not arrive", summary: "Fictional example: a laptop order was paid for, delivery did not happen, and messages went unanswered.", patterns: ["paid", "promised_delivery", "not_delivered", "no_reply"], item: "laptop" },
  { _id: "synthetic-delay-02", synthetic: true, published: true, title: "Delayed order with a seller response", summary: "Fictional example: a paid phone order was delayed; the seller responded and later completed delivery.", patterns: ["paid", "promised_delivery"], item: "phone" },
];
