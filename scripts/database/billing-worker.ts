import { setTimeout } from "node:timers/promises";
import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { BillingService } from "../../src/server/billing/service";
import { BillingWorker } from "../../src/server/billing/worker";
const canceled = new AbortController();
process.on("SIGINT", () => canceled.abort());
process.on("SIGTERM", () => canceled.abort());
const worker = new BillingWorker(
  new BillingService(getDatabase(), getMongoClient()),
);
console.log(
  "Billing worker ready. Fixture ledger by default; Dodo test verification requires explicit configuration.",
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
