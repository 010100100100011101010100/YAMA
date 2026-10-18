import "server-only";
import type { Db, MongoClient } from "mongodb";
import type { PublicTopic } from "@/server/public-web/policy";
import { PublicWebService } from "@/server/public-web/service";
import { PublicWebWorker } from "@/server/public-web/worker";
import type { PublicWebView } from "@/lib/public-web";
import type { DialoguePublicContext } from "@/lib/dialogue-sources";
import type { Report } from "@/server/reports/domain";
import type { DialogueRecord } from "./service";

export function publicLookupTopic(text: string, agent: string): PublicTopic | null {
  if (!["drishti", "disha"].includes(agent) || !/official (?:sources?|links?|websites?|guidance)|search (?:the )?web|web search|scrape|latest (?:official|guidance)|आधिकारिक (?:स्रोत|लिंक|जानकारी)|वेब (?:खोज|सर्च)|official (?:source|link|website) (?:dhoondh|dhund|search|dek)/iu.test(text)) return null;
  if (/consumer|marketplace|delivery|refund|उपभोक्ता|डिलीवरी/iu.test(text)) return "consumer_reporting";
  if (/safety|secure|account recover|सुरक्षा/iu.test(text)) return "cyber_safety";
  return "cyber_reporting";
}

export async function loadDialoguePublicSources(database: Db, client: MongoClient, report: Report, record: DialogueRecord, signal: AbortSignal,
  service = new PublicWebService(database, client), worker = new PublicWebWorker(service)): Promise<DialoguePublicContext | undefined> {
  const turn = record.turn!, topic = publicLookupTopic(turn.userPrompt?.text ?? report.messages.at(-1)!.text, turn.agent);
  if (!topic || !["drishti", "disha"].includes(turn.agent)) return undefined;
  const agent = turn.agent as "drishti" | "disha";
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(50_000)]);
  async function finish(job: PublicWebView) {
    while (["queued", "running"].includes(job.status)) {
      deadline.throwIfAborted();
      const worked = await worker.runOnce(deadline);
      job = await service.get(record.ownerId, report._id, job.id);
      if (!worked && ["queued", "running"].includes(job.status)) await new Promise(resolve => setTimeout(resolve, 100));
    }
    return job;
  }
  try {
    const search = await finish(await service.start(record.ownerId, report._id, { key: turn.id, expectedRevision: report.revision,
      agent, operation: "search_public_web", reason: "public_source_requested", topic }));
    if (search.status !== "ready" || search.result?.kind !== "search" || !search.result.sources.length) return { status: "unavailable", sources: [] };
    const first = search.result.sources[0];
    let page: PublicWebView | null = null;
    try { page = await finish(await service.start(record.ownerId, report._id, { key: search.id, expectedRevision: report.revision,
      agent, operation: "fetch_public_page", searchId: search.id, sourceId: first.id })); } catch { /* Search links remain useful when a page cannot be read. */ }
    return { status: "ready", sources: search.result.sources.map(source => {
      const content = page?.status === "ready" && page.result?.kind === "page" && page.result.source.id === source.id ? page.result : null;
      return { title: source.title, url: source.url, publisher: source.publisher, retrievedAt: content?.source.retrievedAt ?? source.retrievedAt,
        excerpt: content?.text.slice(0, 2000) ?? "", bodyRead: !!content, live: source.trust !== "authored_fixture" };
    }) };
  } catch {
    if (signal.aborted) signal.throwIfAborted();
    return { status: "unavailable", sources: [] };
  }
}
