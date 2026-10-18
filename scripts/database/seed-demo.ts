import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { getServerConfig } from "../../src/server/config";
import { getGraphClient, GraphStore } from "../../src/server/database/graph";
import { EvidenceFiles } from "../../src/server/evidence/files";
import { seedDemoDataset } from "../../src/server/reports/seed-demo";
import { demoStarterNarrative } from "../../src/server/reports/demo-cases";

const config = getServerConfig();
const mongo = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 3 });
let graph: Awaited<ReturnType<typeof getGraphClient>> | undefined;
try {
  await mongo.connect(); graph = await getGraphClient();
  const result = await seedDemoDataset(mongo.db(config.mongoDatabase), mongo, new GraphStore(graph, config.mongoDatabase), new EvidenceFiles(resolve(".local/evidence", config.mongoDatabase)));
  console.log(JSON.stringify(result));
  console.log(`Try this synthetic report in a new chat, review/confirm its notes, and ask Drishti for comparisons:\n${demoStarterNarrative()}`);
} catch {
  console.error("Synthetic case seeding failed. Check local MongoDB/FalkorDB and evidence storage; no credentials were printed.");
  process.exitCode = 1;
} finally { await graph?.close(); await mongo.close(); }
