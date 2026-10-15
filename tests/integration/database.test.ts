import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { connectGraph, type GraphClient } from "@/server/database/graph-client";
import { randomUUID } from "node:crypto";
import { getServerConfig } from "@/server/config";
import { initializeSchema } from "@/server/database/schema";
import { GraphStore, privateGraphName, syntheticCatalogue, type CatalogueCase } from "@/server/database/graph";
import { ReportRepository, jobKey, type GraphJob } from "@/server/reports/repository";
import { getConnections } from "@/server/reports/connections";
import { GraphWorker } from "@/server/jobs/graph-worker";
import type { Report } from "@/server/reports/domain";
import { catalogueVersion } from "@/server/reports/catalogue-policy";

process.loadEnvFile(".env.local");
const namespace = `yama_test_${randomUUID().replaceAll("-", "")}`;
let mongo: MongoClient, database: Db, falkor: GraphClient, graph: GraphStore, repository: ReportRepository;
const create = () => repository.create("owner-a", { synthetic: true, language: "en", narrative: "Fictional: paid for a phone that did not arrive." }, randomUUID());
async function withPatterns() {
  const report = await create();
  return repository.revise("owner-a", report._id, { operation: "propose_assertions", expectedRevision: 1, proposals: [
    { field: "pattern", value: "paid", source: report.assertions[0].source },
    { field: "pattern", value: "not_delivered", source: report.assertions[0].source },
    { field: "item", value: "phone", source: report.assertions[0].source },
  ] });
}
beforeAll(async () => {
  const config = getServerConfig();
  mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", { auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin", serverSelectionTimeoutMS: 5000 });
  await mongo.connect(); database = mongo.db(namespace);
  await initializeSchema(database);
  falkor = await connectGraph(config.graphHost, config.graphPort, config.graphPassword);
  graph = new GraphStore(falkor, namespace);
  await graph.seedCatalogue(syntheticCatalogue);
  for (const entry of syntheticCatalogue) await database.collection<CatalogueCase>("catalogue").insertOne(entry);
  repository = new ReportRepository(database, mongo);
});
afterAll(async () => {
  if (falkor) {
    for (const name of await falkor.list()) if (name.startsWith(`${namespace}_`)) await falkor.selectGraph(name).delete();
    await falkor.close();
  }
  if (mongo) { await mongo.db(namespace).dropDatabase(); await mongo.close(); }
});

describe("real MongoDB and FalkorDB", () => {
  it("bootstraps schema and indexes idempotently", async () => { await expect(initializeSchema(database)).resolves.toBeUndefined(); });
  it("makes creation idempotent and rejects reuse with another payload", async () => {
    const key = randomUUID(); const input = { synthetic: true, language: "hi", narrative: "काल्पनिक घटना: सामान नहीं आया।" };
    const report = await repository.create("owner-a", input, key);
    expect((await repository.create("owner-a", input, key))._id).toBe(report._id);
    await expect(repository.create("owner-a", { ...input, narrative: "Different" }, key)).rejects.toThrow("idempotency_conflict");
  });
  it("filters every read, mutation and confirmation by ownership", async () => {
    const report = await create();
    await expect(repository.get("owner-b", report._id)).rejects.toThrow("report_not_found");
    await expect(repository.revise("owner-b", report._id, { operation: "add_message", expectedRevision: 1, text: "Other" })).rejects.toThrow("report_not_found");
    await expect(repository.confirm("owner-b", report._id, { expectedRevision: 1, acknowledged: true })).rejects.toThrow("report_not_found");
    expect(await repository.list("owner-b")).toEqual([]);
  });
  it("allows exactly one concurrent edit of a revision", async () => {
    const report = await create();
    const changes = await Promise.allSettled(["First", "Second"].map(text => repository.revise("owner-a", report._id, { operation: "add_message", expectedRevision: 1, text })));
    expect(changes.filter(change => change.status === "fulfilled")).toHaveLength(1);
    expect(changes.filter(change => change.status === "rejected")).toHaveLength(1);
    expect((await repository.get("owner-a", report._id)).revision).toBe(2);
    expect(await database.collection("report_revisions").countDocuments({ reportId: report._id })).toBe(2);
  });
  it("rolls back confirmation if its durable graph job cannot be saved", async () => {
    const report = await create();
    await database.command({ collMod: "graph_outbox", validator: { status: "impossible" } });
    try {
      await expect(repository.confirm("owner-a", report._id, { expectedRevision: 1, acknowledged: true })).rejects.toThrow();
      expect((await repository.get("owner-a", report._id)).confirmation).toBeNull();
      expect(await database.collection("report_revisions").countDocuments({ reportId: report._id, kind: "confirmed" })).toBe(0);
    } finally { await initializeSchema(database); }
  });
  it("projects confirmed provenance and queries actual graph patterns", async () => {
    const proposed = await withPatterns();
    await expect(getConnections(repository, graph, "owner-a", proposed._id)).rejects.toThrow("confirmation_required");
    const confirmed = await repository.confirm("owner-a", proposed._id, { expectedRevision: 2, acknowledged: true });
    await repository.confirm("owner-a", proposed._id, { expectedRevision: 2, acknowledged: true });
    expect(await database.collection("graph_outbox").countDocuments({ reportId: confirmed._id })).toBe(1);
    expect((await getConnections(repository, graph, "owner-a", confirmed._id)).status).toBe("pending");
    await new GraphWorker(database, graph).runOnce();
    const result = await getConnections(repository, graph, "owner-a", confirmed._id);
    expect(result.status).toBe("ready");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].pattern.shared).toEqual(expect.arrayContaining(["paid", "not_delivered"]));
    expect(result.candidates[0].linkage.status).toBe("not_assessed");
    expect(result.candidates[0].differences).toHaveLength(1);
    expect(result.recipe).toBe("confirmed-pattern-sources-v1");
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].quote).toBe(confirmed.messages[0].text);
    expect(result.candidates[0].explanation.paths[0].assertionIds).toContain(confirmed.assertions[1].id);
    expect(result.candidates[0].explanation.catalogueVersion).toBe(catalogueVersion(syntheticCatalogue[0]));
    const privateGraph = falkor.selectGraph(privateGraphName(namespace, "owner-a"));
    const rows = await privateGraph.roQuery<{ count: number }>("MATCH (:ReportSnapshot {key: $key})-[:HAS_ASSERTION]->(a)-[:SOURCED_FROM]->() RETURN count(a) AS count", { params: { key: `${confirmed._id}:2` } });
    expect(rows.data?.[0].count).toBe(confirmed.assertions.length);
    // Simulate a crash after projection and before acknowledgement; retry cannot duplicate nodes/edges.
    await database.collection<GraphJob>("graph_outbox").updateOne({ _id: jobKey(confirmed) }, { $set: { status: "processing", leaseUntil: new Date(0) } });
    await new GraphWorker(database, graph).runOnce();
    const retry = await privateGraph.roQuery<{ count: number }>("MATCH (:ReportSnapshot {key: $key})-[:HAS_ASSERTION]->(a) RETURN count(a) AS count", { params: { key: `${confirmed._id}:2` } });
    expect(retry.data?.[0].count).toBe(confirmed.assertions.length);
  });
  it("keeps negative and uncertain assertions out of similarity traversal", async () => {
    const draft = await create();
    const proposed = await repository.revise("owner-a", draft._id, { operation: "propose_assertions", expectedRevision: 1, proposals: [
      { field: "pattern", value: "paid", source: draft.assertions[0].source },
      { field: "pattern", value: "paid", polarity: "contradicted", source: draft.assertions[0].source },
    ] });
    await repository.confirm("owner-a", proposed._id, { expectedRevision: 2, acknowledged: true });
    await new GraphWorker(database, graph).runOnce();
    const result = await getConnections(repository, graph, "owner-a", proposed._id);
    expect(result.status).toBe("ready"); expect(result.candidates).toEqual([]);
    expect(result.sources.map(source => source.status)).toEqual(["blocked", "contradicted"]);
  });
  it("supersedes a stale job and rejects results for edited reports", async () => {
    const report = await create();
    await repository.confirm("owner-a", report._id, { expectedRevision: 1, acknowledged: true });
    await repository.revise("owner-a", report._id, { operation: "add_message", expectedRevision: 1, text: "A correction" });
    const project = vi.fn();
    await new GraphWorker(database, { project }).runOnce();
    expect(project).not.toHaveBeenCalled();
    expect((await database.collection<GraphJob>("graph_outbox").findOne({ _id: jobKey(report) }))?.status).toBe("superseded");
    await expect(getConnections(repository, graph, "owner-a", report._id)).rejects.toThrow("confirmation_required");
  });
  it("rechecks the revision after a graph query", async () => {
    const proposed = await withPatterns();
    await repository.confirm("owner-a", proposed._id, { expectedRevision: 2, acknowledged: true });
    await new GraphWorker(database, graph).runOnce();
    await expect(getConnections(repository, { readPatternSources: graph.readPatternSources.bind(graph), findConnections: async () => {
      await repository.revise("owner-a", proposed._id, { operation: "add_message", expectedRevision: 2, text: "Edited during query" });
      return [{ id: syntheticCatalogue[0]._id, version: catalogueVersion(syntheticCatalogue[0]), sharedPatterns: ["paid"] }];
    } }, "owner-a", proposed._id)).rejects.toThrow("revision_conflict");
  });
  it("rejects graph provenance that differs from the canonical confirmed source", async () => {
    const proposed = await withPatterns();
    await repository.confirm("owner-a", proposed._id, { expectedRevision: 2, acknowledged: true });
    await new GraphWorker(database, graph).runOnce();
    await falkor.selectGraph(privateGraphName(namespace, "owner-a")).query("MATCH (a:Assertion {key: $key})-[:SOURCED_FROM]->(s) SET s.start = 1", { params: { key: `${proposed._id}:2:${proposed.assertions[1].id}` } });
    await expect(getConnections(repository, graph, "owner-a", proposed._id)).rejects.toMatchObject({ code: "projection_invalid" });
  });
  it("rejects changed catalogue content and filters withdrawn examples", async () => {
    const proposed = await withPatterns();
    await repository.confirm("owner-a", proposed._id, { expectedRevision: 2, acknowledged: true });
    await new GraphWorker(database, graph).runOnce();
    const entry = syntheticCatalogue[0];
    try {
      await database.collection<CatalogueCase>("catalogue").updateOne({ _id: entry._id }, { $set: { summary: "A changed authored example" } });
      await expect(getConnections(repository, graph, "owner-a", proposed._id)).rejects.toMatchObject({ code: "catalogue_changed" });
      await database.collection<CatalogueCase>("catalogue").updateOne({ _id: entry._id }, { $set: { published: false } });
      expect((await getConnections(repository, graph, "owner-a", proposed._id)).candidates.map(candidate => candidate.id)).not.toContain(entry._id);
    } finally { await database.collection<CatalogueCase>("catalogue").replaceOne({ _id: entry._id }, entry); }
  });
  it("requires a real snapshot and rejects non-synthetic catalogue publication", async () => {
    await expect(graph.findConnections("missing-owner", randomUUID(), 1)).rejects.toThrow("projection_missing");
    await expect(graph.findConnections("owner-a", randomUUID(), 1)).rejects.toThrow("projection_missing");
    await expect(graph.seedCatalogue([{ ...syntheticCatalogue[0], synthetic: false } as unknown as CatalogueCase])).rejects.toThrow();
  });
  it("does not mistake missing pattern edges for a genuine empty comparison", async () => {
    const proposed = await withPatterns(); await repository.confirm("owner-a", proposed._id, { expectedRevision: 2, acknowledged: true });
    await new GraphWorker(database, graph).runOnce();
    await falkor.selectGraph(privateGraphName(namespace, "owner-a")).query("MATCH (r:ReportSnapshot {key: $key})-[p:HAS_PATTERN]->() DELETE p", { params: { key: `${proposed._id}:2` } });
    await expect(getConnections(repository, graph, "owner-a", proposed._id)).rejects.toMatchObject({ code: "projection_invalid" });
  });
  it("bounds retries and stores a generic failure code", async () => {
    const report = await create();
    await repository.confirm("owner-a", report._id, { expectedRevision: 1, acknowledged: true });
    await database.collection<GraphJob>("graph_outbox").updateOne({ _id: jobKey(report) }, { $set: { attempts: 4 } });
    await new GraphWorker(database, { project: async () => { throw new Error("sensitive detail must not be stored"); } }).runOnce();
    const job = await database.collection<GraphJob>("graph_outbox").findOne({ _id: jobKey(report) });
    expect(job?.status).toBe("failed"); expect(job?.errorCode).toBe("projection_failed");
  });
  it("never puts another account's report into the shared catalogue graph", async () => {
    const report = await repository.create("owner-b", { synthetic: true, language: "en", narrative: "Private fictional identifier" }, randomUUID());
    await repository.confirm("owner-b", report._id, { expectedRevision: 1, acknowledged: true });
    await new GraphWorker(database, graph).runOnce();
    const result = await falkor.selectGraph(`${namespace}_catalogue`).roQuery<{ count: number }>("MATCH (r:ReportSnapshot) RETURN count(r) AS count");
    expect(result.data?.[0].count).toBe(0);
    expect(privateGraphName(namespace, "owner-a")).not.toBe(privateGraphName(namespace, "owner-b"));
    await expect(getConnections(repository, graph, "owner-a", report._id)).rejects.toThrow("report_not_found");
    expect(await database.collection<Report>("reports").countDocuments({ ownerId: "owner-b" })).toBe(1);
  });
  it("fails a refused graph connection without an unhandled event or retry loop", async () => {
    await expect(connectGraph("127.0.0.1", 6399, "unused-local-test-password")).rejects.toThrow("graph_unavailable");
  });
});
