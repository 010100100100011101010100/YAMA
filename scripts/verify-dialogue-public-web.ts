// Operator smoke check: only generic public guidance leaves this process.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { getDatabase, getMongoClient } from "../src/server/database/mongo";
import type { Report } from "../src/server/reports/domain";
import { queuedTurn, type DialogueRecord } from "../src/server/dialogue/service";
import { loadDialoguePublicSources } from "../src/server/dialogue/public-sources";

try {
  const report = await getDatabase().collection<Report>("reports").findOne({ _id: process.argv[2] });
  if (!report) throw new Error("Supply an existing owned demo report ID.");
  const contextReport = { ...report, messages: [{ id: randomUUID(), text: "Please search the web for official sources about consumer reporting in India.", createdAt: new Date() }] };
  const record: DialogueRecord = { _id: report._id, ownerId: report.ownerId, version: 0, activeAgent: "disha", automatic: false, language: "en", messages: [],
    turn: queuedTurn(contextReport, "disha", contextReport.messages[0].id), requests: [], updatedAt: new Date() };
  const context = await loadDialoguePublicSources(getDatabase(), getMongoClient(), contextReport, record, new AbortController().signal);
  const jobs = await getDatabase().collection("public_web_jobs").find({ ownerId: report.ownerId, reportId: report._id, createdAt: { $gte: record.updatedAt } },
    { projection: { _id: 0, operation: 1, status: 1, errorCode: 1, adapter: 1 } }).toArray();
  const verification = { checkedAt: new Date().toISOString(), status: context?.status, sources: context?.sources.map(source => ({ url: source.url, live: source.live, bodyRead: source.bodyRead, excerptCharacters: source.excerpt.length })), jobs };
  await writeFile("docs/design/dialogue-public-web-verification.json", JSON.stringify(verification, null, 2) + "\n");
  console.log(JSON.stringify(verification));
} catch { console.error("Public-source smoke check failed; no credentials were logged."); process.exitCode = 1; }
finally { await getMongoClient().close(); }
