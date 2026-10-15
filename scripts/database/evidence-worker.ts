import { join } from "node:path";
import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { getServerConfig } from "../../src/server/config";
import { EvidenceFiles } from "../../src/server/evidence/files";
import { EvidenceWorker } from "../../src/server/evidence/worker";

const stopping = new AbortController();
process.on("SIGINT", () => stopping.abort());
process.on("SIGTERM", () => stopping.abort());
const worker = new EvidenceWorker(getDatabase(), new EvidenceFiles(join(process.cwd(), ".local/evidence", getServerConfig().mongoDatabase)));
console.log("Evidence worker ready (synthetic localhost). One isolated parser at a time.");
try {
  do {
    const processed = await worker.runOnce(stopping.signal);
    if (process.argv.includes("--once")) break;
    if (!processed) await new Promise(resolve => setTimeout(resolve, 1000));
  } while (!stopping.signal.aborted);
} catch { console.error("Evidence worker stopped: database_unavailable"); process.exitCode = 1; }
finally { await getMongoClient().close(); }
