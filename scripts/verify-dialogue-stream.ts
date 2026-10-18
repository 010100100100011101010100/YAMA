// Operator observer: stream timing/counts only; no prompts, reply content or credentials are recorded.
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { getDatabase, getMongoClient } from "../src/server/database/mongo";
import type { DialogueRecord } from "../src/server/dialogue/service";
import type { Report } from "../src/server/reports/domain";

const id = z.uuid().parse(process.argv[2]), events: object[] = [];
const db = getDatabase();
if (!await db.collection<Report>("reports").findOne({ _id: id, synthetic: true })) throw new Error("synthetic_report_required");
const cursor = db.collection<DialogueRecord>("dialogues").watch([{ $match: { "documentKey._id": id } }], { fullDocument: "updateLookup", maxAwaitTimeMS: 1000 });
const timer = setTimeout(() => { void cursor.close(); }, 150_000);
console.log("Observing streaming metadata for the supplied synthetic report.");
try {
  for await (const change of cursor) {
    if (!("fullDocument" in change)) continue;
    const turn = change.fullDocument?.turn;
    if (!turn) continue;
    events.push({ at: new Date().toISOString(), turnId: turn.id, agent: turn.agent, status: turn.status,
      sequence: turn.preview?.sequence, characters: turn.preview?.text.length, streamed: turn.streamed });
    if (["delivered", "failed"].includes(turn.status)) break;
  }
} finally {
  clearTimeout(timer); await cursor.close();
  await writeFile("docs/design/live-stream-events.json", JSON.stringify({ reportId: id, events }, null, 2) + "\n");
  console.log(`Recorded ${events.length} state events without response content.`);
  await getMongoClient().close();
}
