import "server-only";
import { createHash } from "node:crypto";
import { Graph } from "falkordb";
import { connectGraph, type GraphClient } from "./graph-client";
import { getServerConfig } from "@/server/config";
import { matchingPatterns, type Report } from "@/server/reports/domain";
import { contactKey, matchingIdentifiers } from "@/server/reports/identifiers";
import { catalogueSchema, catalogueVersion, type CatalogueCase } from "@/server/reports/catalogue-policy";
import { catalogueDetails } from "@/server/reports/retrieval-details";
import { retrieveCatalogue } from "./graphrag";
export type { CatalogueCase } from "@/server/reports/catalogue-policy";

const shared = globalThis as typeof globalThis & { yamaGraph?: Promise<GraphClient> };
export async function getGraphClient(): Promise<GraphClient> {
  if (!shared.yamaGraph) {
    const config = getServerConfig();
    shared.yamaGraph = connectGraph(config.graphHost, config.graphPort, config.graphPassword, { username: config.graphUsername, tls: config.graphTls })
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
    await graph.query(`MERGE (r:ReportSnapshot {key: $key}) SET r.reportId = $reportId, r.revision = $revision, r.confirmation = 'user_confirmed', r.reporterName = $reporterName
      WITH r UNWIND $assertions AS assertion
      MERGE (a:Assertion {key: assertion.key}) SET a.assertionId = assertion.id, a.field = assertion.field, a.value = assertion.value,
        a.originalValue = assertion.originalValue, a.included = assertion.included, a.polarity = assertion.polarity, a.origin = assertion.origin
      MERGE (r)-[:HAS_ASSERTION]->(a)
      MERGE (s:SourceRange {key: assertion.key}) SET s.messageId = assertion.messageId, s.start = assertion.start, s.end = assertion.end,
        s.sourceKind = assertion.sourceKind, s.evidenceId = assertion.evidenceId, s.sha256 = assertion.sha256,
        s.textSha256 = assertion.textSha256, s.extraction = assertion.extraction
      MERGE (a)-[:SOURCED_FROM]->(s)`, {
      TIMEOUT: 3000, params: { key: `${report._id}:${report.revision}`, reportId: report._id, revision: report.revision, reporterName: report.reporter?.name ?? "",
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
    await graph.query(`MATCH (r:ReportSnapshot {key: $key}) WITH r UNWIND $identifiers AS key
      MERGE (i:Identifier {key: key}) MERGE (r)-[:HAS_IDENTIFIER]->(i)`, {
      TIMEOUT: 3000, params: { key: `${report._id}:${report.revision}`, identifiers: [...new Set(matchingIdentifiers(report).map(source => source.key))] },
    });
  }
  async seedCatalogue(cases: CatalogueCase[]) {
    await this.ensureIndex(this.catalogueGraph, "CatalogueCase", "id");
    await this.ensureIndex(this.catalogueGraph, "FictionalActor", "id");
    await this.ensureIndex(this.catalogueGraph, "HarmCategory", "key");
    // Only explicit synthetic fixtures enter this shared graph. No report projection uses it.
    for (const entry of cases) {
      catalogueSchema.parse(entry);
      await this.catalogueGraph.query(`MERGE (c:CatalogueCase {id: $id}) SET c.synthetic = true, c.published = $published, c.contentVersion = $version,
        c.reporterName = $reporterName, c.city = $city, c.occupation = $occupation, c.title = $title
        WITH c OPTIONAL MATCH (c)-[old:HAS_PATTERN]->() DELETE old
        WITH DISTINCT c UNWIND $patterns AS key MERGE (p:Pattern {key: key}) MERGE (c)-[:HAS_PATTERN]->(p)`, {
        TIMEOUT: 3000, params: { id: entry._id, patterns: entry.published ? entry.patterns : [], published: entry.published, version: catalogueVersion(entry),
          reporterName: entry.reporter?.name ?? "", city: entry.reporter?.city ?? "", occupation: entry.reporter?.occupation ?? "", title: entry.title },
      });
      await this.catalogueGraph.query(`MATCH (c:CatalogueCase {id: $id}) OPTIONAL MATCH (c)-[old:HAS_IDENTIFIER]->() DELETE old
        WITH DISTINCT c UNWIND $identifiers AS key MERGE (i:Identifier {key: key}) MERGE (c)-[:HAS_IDENTIFIER]->(i)`, {
        TIMEOUT: 3000, params: { id: entry._id, identifiers: entry.published ? (entry.identifiers ?? []).filter(identifier => identifier.polarity === "affirmed").map(identifier => contactKey(identifier.kind, identifier.value)) : [] },
      });
      await this.catalogueGraph.query(`MATCH (c:CatalogueCase {id: $id}) OPTIONAL MATCH (c)-[old:HAS_HARM]->() DELETE old
        WITH DISTINCT c UNWIND $harms AS key MERGE (h:HarmCategory {key: key})
        MERGE (c)-[r:HAS_HARM]->(h) SET r.basis = 'reported_concern'`, {
        TIMEOUT: 3000, params: { id: entry._id, harms: entry.published ? entry.harmCategories ?? [] : [] },
      });
      // This is the author's fictional answer key. Runtime matching never traverses these edges.
      await this.catalogueGraph.query(`MATCH (c:CatalogueCase {id: $id}) OPTIONAL MATCH (c)-[old:AUTHORED_ACTOR]->() DELETE old
        WITH DISTINCT c UNWIND $actors AS actor MERGE (a:FictionalActor {id: actor.id})
        SET a.name = actor.name, a.fictional = true, a.basis = 'authored_fixture_truth'
        MERGE (c)-[r:AUTHORED_ACTOR]->(a) SET r.basis = 'authored_fixture_truth'`, {
        TIMEOUT: 3000, params: { id: entry._id, actors: entry.published && entry.fictionalActor ? [entry.fictionalActor] : [] },
      });
      await this.catalogueGraph.query(`MATCH (c:CatalogueCase {id:$id}) OPTIONAL MATCH (c)-[old:HAS_DISCOVERY_DETAIL]->() DELETE old
        WITH DISTINCT c UNWIND $keys AS key MERGE (d:DiscoveryDetail {key:key}) MERGE (c)-[:HAS_DISCOVERY_DETAIL]->(d)`, {
        TIMEOUT: 3000, params: { id: entry._id, keys: entry.published ? catalogueDetails(entry).map(detail => detail.key) : [] },
      });
      await this.catalogueGraph.query(`MATCH (c:CatalogueCase {id:$id}) WHERE c.published=false OR c.semanticVersion<>c.contentVersion
        REMOVE c:PublishedSemanticCase SET c.embedding=null, c.semanticHash=null, c.semanticVersion=null`, { TIMEOUT: 3000, params: { id: entry._id } });
    }
  }
  async findConnections(ownerId: string, reportId: string, revision: number, details: string[] = [], semanticQuery = ""): Promise<GraphConnectionMatch[]> {
    const snapshot = await this.privateGraph(ownerId).roQuery<{ patterns: string[]; snapshots: number }>(
      "MATCH (r:ReportSnapshot {key: $key}) OPTIONAL MATCH (r)-[:HAS_PATTERN]->(p:Pattern) RETURN count(DISTINCT r) AS snapshots, collect(p.key) AS patterns",
      { TIMEOUT: 3000, params: { key: `${reportId}:${revision}` } },
    ).catch(error => {
      if (error instanceof Error && error.message === "ERR Invalid graph operation on empty key") throw new Error("projection_missing");
      throw error;
    });
    if (snapshot.data?.[0]?.snapshots !== 1) throw new Error("projection_missing");
    const patterns = snapshot.data[0].patterns;
    const contacts = await this.privateGraph(ownerId).roQuery<{ identifiers: string[] }>(
      "MATCH (:ReportSnapshot {key: $key})-[:HAS_IDENTIFIER]->(i:Identifier) RETURN collect(DISTINCT i.key) AS identifiers",
      { TIMEOUT: 3000, params: { key: `${reportId}:${revision}` } },
    );
    const identifiers = contacts.data?.[0]?.identifiers ?? [];
    if (!patterns.length && !identifiers.length && !details.length && !semanticQuery) return [];
    return retrieveCatalogue(this.namespace, { patterns, identifiers, details }, semanticQuery);
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

export type GraphConnectionMatch = { id: string; version: string; sharedPatterns: string[]; sharedIdentifiers?: string[]; sharedDetails?: string[];
  semantic?: { score: number; model: string; revision: string; documentHash: string; queryHash: string } };

export type GraphPatternSource = { assertionId: string; value: string; originalValue: string; origin: string; included: boolean; polarity: string;
  messageId: string; start: number; end: number; evidenceId: string; sha256: string; textSha256: string; traversable: boolean };
export const syntheticCatalogue: CatalogueCase[] = [
  { _id: "synthetic-delivery-01", synthetic: true, published: true, title: "Paid order that did not arrive", summary: "Fictional example: a laptop order was paid for, delivery did not happen, and messages went unanswered.", patterns: ["paid", "promised_delivery", "not_delivered", "no_reply"], item: "laptop" },
  { _id: "synthetic-delay-02", synthetic: true, published: true, title: "Delayed order with a seller response", summary: "Fictional example: a paid phone order was delayed; the seller responded and later completed delivery.", patterns: ["paid", "promised_delivery"], item: "phone" },
];
