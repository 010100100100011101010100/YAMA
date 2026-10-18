import "server-only";
import type { RetrievalDetail } from "@/lib/retrieval";
import type { CatalogueCase } from "./catalogue-policy";
import type { Report } from "./domain";
import { clauseStatus } from "./identifiers";
import { discloseCatalogueCase } from "./disclosure";

type DiscoverySource = RetrievalDetail & { status: ReturnType<typeof clauseStatus> };
function fromText(text: string): DiscoverySource[] {
  const details: DiscoverySource[] = [];
  for (const match of text.matchAll(/(?:INR|₹|Rs\.?)\s*(\d[\d,]*(?:\.\d{1,2})?)/giu)) {
    const value = Number(match[1].replaceAll(",", ""));
    if (Number.isFinite(value) && value > 0) details.push({ kind: "amount", key: `amount:${value}`, value: String(value), quote: match[0], status: clauseStatus(text, match.index, match.index + match[0].length) });
  }
  for (const prefix of text.matchAll(/(?:calling (?:himself|herself|themselves)|displayed (?:the )?name|(?:seller['’]s|agent['’]s) name|name (?:was|is)|naam(?: tha| hai)?|नाम(?: था| है)?)\s+/giu)) {
    const name = text.slice(prefix.index + prefix[0].length).match(/^[\p{L}][\p{L}\p{M}'’-]*(?:[ \t]+[\p{L}][\p{L}\p{M}'’-]*)?/u)?.[0];
    if (!name) continue;
    const value = name.normalize("NFKC").toLowerCase();
    details.push({ kind: "reported_alias", key: `reported_alias:${value}`, value, quote: name, status: clauseStatus(text, prefix.index, prefix.index + prefix[0].length + name.length) });
  }
  return details;
}
function supporting(details: DiscoverySource[]): RetrievalDetail[] {
  const blocked = new Set(details.filter(detail => ["contradicted", "uncertain"].includes(detail.status)).map(detail => detail.key));
  return [...new Map(details.filter(detail => detail.status === "supporting" && !blocked.has(detail.key)).map(({ status, ...detail }) => { void status; return [detail.key, detail] as const; })).values()].filter(detail => detail.quote.length <= 254).slice(0, 50);
}
export function reportDetails(report: Report): RetrievalDetail[] {
  if (report.confirmation?.revision !== report.revision) return [];
  const details = report.assertions.flatMap(assertion => {
    if (!assertion.included || assertion.value !== assertion.originalValue) return [];
    const message = report.messages.find(message => message.id === assertion.source.messageId);
    if (!message || message.text.slice(assertion.source.start, assertion.source.end) !== assertion.originalValue) return [];
    if (assertion.field === "item") { const value = assertion.value.normalize("NFKC").trim().toLowerCase(); return [{ kind: "item" as const, key: `item:${value}`, value, quote: assertion.value, status: assertion.polarity === "affirmed" ? clauseStatus(message.text, assertion.source.start, assertion.source.end) : assertion.polarity }]; }
    if (assertion.field === "amount" && /^\d[\d,]*(?:\.\d{1,2})?$/u.test(assertion.value.trim())) {
      const value = Number(assertion.value.replaceAll(",", ""));
      return value > 0 ? [{ kind: "amount" as const, key: `amount:${value}`, value: String(value), quote: assertion.value, status: assertion.polarity === "affirmed" ? clauseStatus(message.text, assertion.source.start, assertion.source.end) : assertion.polarity }] : [];
    }
    return fromText(assertion.value).map(detail => ({ ...detail, status: detail.status === "excluded" || assertion.polarity === "affirmed" ? detail.status : assertion.polarity }));
  });
  return supporting(details);
}
export function catalogueDetails(entry: CatalogueCase): RetrievalDetail[] {
  // Only published account text supplies a reported alias; AUTHORED_ACTOR is never used.
  const details = fromText(discloseCatalogueCase(entry).summary);
  const item = entry.item.normalize("NFKC").trim().toLowerCase();
  details.push({ kind: "item", key: `item:${item}`, value: item, quote: entry.item, status: "supporting" });
  return supporting(details);
}
