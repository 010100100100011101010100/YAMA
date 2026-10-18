import "server-only";
import type { DialogueReply } from "@/lib/dialogue";
import { demoCatalogue } from "@/server/reports/demo-cases";

// Defense for saved replies created before the disclosure boundary existed.
// The fixture profiles are a closed list; this is not general-purpose PII detection.
const privateDetails = new Map(demoCatalogue.map(entry => [entry._id, entry.reporter
  ? [entry.reporter.name, ...entry.reporter.name.split(/\s+/), entry.reporter.city, entry.reporter.occupation] : []]));
export function hideReporterDetails(text: string, caseIds = [...privateDetails.keys()]) {
  const patterns = [...new Set(caseIds.flatMap(id => privateDetails.get(id) ?? []))].sort((a, b) => b.length - a.length)
    .map(value => new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "giu"));
  return patterns.reduce((safe, pattern) => safe.replace(pattern, "[detail hidden]"), text);
}
export function conversationText(text: string, caseIds?: string[]) {
  return hideReporterDetails(text, caseIds)
    .replace(/^(?:(?:Hey|Hi)[,!]?\s*)?I[’']m (?:Saathi|Drishti|Disha)[.,!]\s*/iu, "")
    .replace(/^मैं (?:साथी|दृष्टि|दिशा) हूँ[।,.]\s*/u, "")
    .replace(/^Main (?:Saathi|Drishti|Disha) hoon[.,!]\s*/iu, "")
    .replace(/fictional (?:examples?|cases?)/giu, "related reports")
    .replace(/synthetic user reports?/giu, "reported accounts")
    .replace(/synthetic reported outcomes/giu, "reported outcomes")
    .replace(/काल्पनिक उदाहरणों/gu, "संबंधित मामलों").replace(/काल्पनिक उदाहरण/gu, "संबंधित मामला");
}
export function protectReply<T extends Pick<DialogueReply, "text" | "question">>(reply: T, caseIds?: string[]): T {
  return { ...reply, text: conversationText(reply.text, caseIds), ...(reply.question ? { question: { ...reply.question,
    prompt: hideReporterDetails(reply.question.prompt, caseIds), options: reply.question.options.map(option => hideReporterDetails(option, caseIds)),
    placeholder: reply.question.placeholder ? hideReporterDetails(reply.question.placeholder, caseIds) : null } } : {}) };
}
