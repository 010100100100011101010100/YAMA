import { setTimeout } from "node:timers/promises";
import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { VoiceWorker } from "../../src/server/voice/worker";
const canceled = new AbortController();
process.on("SIGINT", () => canceled.abort());
process.on("SIGTERM", () => canceled.abort());
const worker = new VoiceWorker(getDatabase(), getMongoClient());
console.log(
  "Voice worker ready (synthetic localhost). Live provider access requires explicit configuration.",
);
try {
  while (!canceled.signal.aborted) {
    const worked = await worker.runOnce(canceled.signal).catch(() => false);
    if (!worked)
      await setTimeout(1000, undefined, { signal: canceled.signal }).catch(
        () => undefined,
      );
  }
} finally {
  await getMongoClient().close();
}
