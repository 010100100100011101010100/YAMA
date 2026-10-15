import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { AgentWorker } from "../../src/server/agents/worker";
import { DialogueWorker } from "../../src/server/dialogue/worker";

const stopping = new AbortController();
process.on("SIGINT", () => stopping.abort()); process.on("SIGTERM", () => stopping.abort());
const worker = new AgentWorker(getDatabase(), getMongoClient());
const dialogue = new DialogueWorker(getDatabase(), getMongoClient());
console.log("Agent worker ready (synthetic localhost, extraction and text dialogue). One task at a time.");
try {
  do {
    const processed = await dialogue.runOnce(stopping.signal) || await worker.runOnce(stopping.signal);
    if (process.argv.includes("--once")) break;
    if (!processed) await new Promise(resolve => setTimeout(resolve, 1000));
  } while (!stopping.signal.aborted);
} catch { console.error("Agent worker stopped: database_unavailable"); process.exitCode = 1; }
finally { await getMongoClient().close(); }
