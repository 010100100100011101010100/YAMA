import "server-only";
import { AGENT_ALIASES } from "@/lib/agent-addressing";
import { identifierSourceSchema, type IdentifierSource } from "@/lib/case-identifiers";
import type { Report } from "./domain";

export function contactKey(kind: IdentifierSource["kind"], value: string) {
  const normalized = kind === "phone" ? `+${value.replace(/\D/g, "")}` : value.toLowerCase();
  return `${kind}:${normalized}`;
}

function contacts(text: string) {
  const found: { kind: IdentifierSource["kind"]; quote: string; start: number; end: number }[] = [];
  const expressions: [IdentifierSource["kind"], RegExp][] = [
    ["phone", /(?<![\w+])\+\d[\d ()-]{7,22}\d(?!\w)/g],
    ["email", /(?<![\w.+-])[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+(?![\w-])/g],
    ["telegram", /(?<![\w@])@[a-zA-Z][a-zA-Z0-9_]{4,31}\b/g],
  ];
  for (const [kind, expression] of expressions) for (const match of text.matchAll(expression)) {
    if (kind === "telegram" && Object.hasOwn(AGENT_ALIASES, match[0].slice(1).toLowerCase())) continue;
    if (found.some(other => match.index < other.end && match.index + match[0].length > other.start)) continue;
    found.push({ kind, quote: match[0], start: match.index, end: match.index + match[0].length });
  }
  return found.sort((left, right) => left.start - right.start);
}

// This conservative matcher supplies exact contact overlap, never an identity verdict.
// A full source clause with negation/uncertainty is excluded, even if another contact in it could be positive.
export function clauseStatus(text: string, start: number, end: number): "supporting" | "contradicted" | "uncertain" | "excluded" {
  const separators = [...text.matchAll(/[.!?]\s|[\n;]/g)];
  const before = separators.filter(match => match.index < start).at(-1);
  const after = separators.find(match => match.index >= end);
  const clause = text.slice(before ? before.index + before[0].length : 0, after?.index ?? text.length);
  if (/[`"“”]|^\s*>/u.test(clause)) return "excluded";
  if (/\b(?:not|never|unrelated|different|mistaken|incorrect|exclude|no contact|didn['’]t|wasn['’]t|isn['’]t)\b|नहीं|गलत|अलग/iu.test(clause)) return "contradicted";
  if (/\b(?:maybe|perhaps|unsure|uncertain|unconfirmed|possibly|might|guess|not sure)\b|शायद|पता नहीं/iu.test(clause)) return "uncertain";
  return "supporting";
}

export function identifierSources(report: Report): IdentifierSource[] {
  const sources: IdentifierSource[] = [];
  for (const assertion of report.assertions) {
    if (!["narrative", "note"].includes(assertion.field) || assertion.value !== assertion.originalValue) continue;
    const message = report.messages.find(message => message.id === assertion.source.messageId);
    if (!message || assertion.source.start < 0 || assertion.source.end > message.text.length || assertion.source.end <= assertion.source.start) continue;
    const quote = message.text.slice(assertion.source.start, assertion.source.end);
    for (const contact of contacts(quote)) {
      if (!assertion.value.toLowerCase().includes(contact.quote.toLowerCase())) continue;
      const key = contactKey(contact.kind, contact.quote);
      const status = !assertion.included ? "excluded" : assertion.polarity !== "affirmed" ? assertion.polarity : clauseStatus(quote, contact.start, contact.end);
      sources.push(identifierSourceSchema.parse({ kind: contact.kind, key, value: key.slice(contact.kind.length + 1), assertionId: assertion.id,
        source: { messageId: message.id, start: assertion.source.start + contact.start, end: assertion.source.start + contact.end }, quote: contact.quote,
        status, evidenceId: message.evidenceSource?.evidenceId ?? null }));
    }
  }
  const blocked = new Set(sources.filter(source => ["contradicted", "uncertain"].includes(source.status)).map(source => source.key));
  return sources.map(source => source.status === "supporting" && blocked.has(source.key) ? { ...source, status: "blocked" as const } : source).slice(0, 100);
}

export function matchingIdentifiers(report: Report) {
  if (report.confirmation?.revision !== report.revision) return [];
  return identifierSources(report).filter(source => source.status === "supporting");
}
