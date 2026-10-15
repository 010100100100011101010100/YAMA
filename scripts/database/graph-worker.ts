import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { getGraphClient, GraphStore } from "../../src/server/database/graph";
import { getServerConfig } from "../../src/server/config";
import { GraphWorker } from "../../src/server/jobs/graph-worker";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
const graph = await getGraphClient();
const worker = new GraphWorker(getDatabase(), new GraphStore(graph, getServerConfig().mongoDatabase));
console.log("Graph worker ready (synthetic localhost). Press Ctrl+C to stop.");
try {
  do {
    const processed = await worker.runOnce();
    if (process.argv.includes("--once")) break;
    if (!processed) await new Promise(resolve => setTimeout(resolve, 1000));
  } while (!stopping);
} catch { console.error("Graph worker stopped: database_unavailable"); process.exitCode = 1; }
finally { await graph.close(); await getMongoClient().close(); }
