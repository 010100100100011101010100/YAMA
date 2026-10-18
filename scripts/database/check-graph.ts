import { lookup } from "node:dns/promises";
import { parseServerConfig } from "../../src/server/config";
import { connectGraph, type GraphClient } from "../../src/server/database/graph-client";

// Read-only: checks the selected destination without switching it or creating graphs.
let client: GraphClient | undefined;
let stage = "configuration";
try {
  const config = parseServerConfig({ ...process.env, ...(process.argv.includes("--cloud") ? { YAMA_GRAPH_TARGET: "cloud" } : {}) });
  stage = "dns";
  await lookup(config.graphHost);
  stage = "authentication";
  client = await connectGraph(config.graphHost, config.graphPort, config.graphPassword, { username: config.graphUsername, tls: config.graphTls });
  stage = "graph_read";
  const names = await client.list();
  const catalogue = `${config.mongoDatabase}_catalogue`;
  const counts = names.includes(catalogue) ? await client.selectGraph(catalogue).roQuery<{ cases: number }>(
    "MATCH (c:CatalogueCase) RETURN count(c) AS cases", { TIMEOUT: 3000 }) : undefined;
  console.log(JSON.stringify({ target: config.graphTarget, tls: config.graphTls, authenticated: true,
    cataloguePresent: Boolean(counts), catalogueCases: counts?.data?.[0]?.cases ?? 0 }));
} catch (error) {
  const code = stage === "dns" && error instanceof Error && "code" in error
    ? (error as NodeJS.ErrnoException).code : "graph_unavailable";
  console.error(JSON.stringify({ status: "unavailable", stage, code }));
  process.exitCode = 1;
} finally { await client?.close(); }
