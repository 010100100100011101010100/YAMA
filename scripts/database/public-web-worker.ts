import { setTimeout } from "node:timers/promises";
import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { PublicWebService } from "../../src/server/public-web/service";
import { PublicWebWorker } from "../../src/server/public-web/worker";
const canceled = new AbortController();
process.on("SIGINT", () => canceled.abort());
process.on("SIGTERM", () => canceled.abort());
const worker = new PublicWebWorker(
  new PublicWebService(getDatabase(), getMongoClient()),
);
console.log(
  "Public web worker ready. Authored fixtures are the default; live providers require explicit configuration.",
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
