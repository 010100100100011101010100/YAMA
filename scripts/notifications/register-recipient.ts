import { readFile, stat } from "node:fs/promises";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { NotificationService } from "../../src/server/notifications/service";
const path = ".local/secrets/notification-recipient.json";
try {
  if (((await stat(path)).mode & 0o777) !== 0o600)
    throw new Error("Recipient file must have mode 0600");
  const input = z
    .strictObject({
      ownerId: z.string().regex(/^[a-f0-9]{24}$/),
      address: z.email().max(254),
      acknowledged: z.literal(true),
      operation: z.enum(["register", "revoke"]),
    })
    .parse(JSON.parse(await readFile(path, "utf8")));
  const db = getDatabase();
  if (
    !(await db.collection("user").findOne({ _id: new ObjectId(input.ownerId) }))
  )
    throw new Error("Unknown demo account");
  const service = new NotificationService(db, getMongoClient());
  if (input.operation === "register")
    await service.registerRecipient(
      input.ownerId,
      input.address,
      input.acknowledged,
    );
  else
    await service.recipients.updateOne(
      { ownerId: input.ownerId, mode: "live" },
      { $set: { active: false } },
    );
  console.log(
    "Synthetic test recipient registration updated. No address or credential was printed.",
  );
} catch {
  console.error(
    "Recipient registration failed. Check the protected local file, account ID and acknowledgement; no private values were printed.",
  );
  process.exitCode = 1;
} finally {
  await getMongoClient().close();
}
