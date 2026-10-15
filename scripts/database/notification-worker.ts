import { setTimeout } from "node:timers/promises";
import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { NotificationService } from "../../src/server/notifications/service";
import { NotificationWorker } from "../../src/server/notifications/worker";
const canceled = new AbortController();
process.on("SIGINT", () => canceled.abort());
process.on("SIGTERM", () => canceled.abort());
const worker = new NotificationWorker(
  new NotificationService(getDatabase(), getMongoClient()),
);
console.log(
  "Notification worker ready. Fixtures capture approved previews locally; live dispatch requires explicit configuration.",
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
