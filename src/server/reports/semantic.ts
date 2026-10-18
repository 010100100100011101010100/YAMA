import "server-only";
import { createHash } from "node:crypto";
import type { Report } from "./domain";
import type { CatalogueCase } from "./catalogue-policy";
import { discloseCatalogueCase } from "./disclosure";
import { ServiceError } from "@/server/errors";

export const SEMANTIC_MODEL = "intfloat/multilingual-e5-small" as const;
export const SEMANTIC_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3" as const;
export const semanticHash = (text: string) => createHash("sha256").update(text).digest("hex");
export function reportSemanticText(report: Report) {
  if (report.confirmation?.revision !== report.revision) return "";
  const values = report.assertions.flatMap(assertion => {
    if (!assertion.included || assertion.polarity !== "affirmed" || assertion.field === "pattern" || assertion.value !== assertion.originalValue) return [];
    const message = report.messages.find(message => message.id === assertion.source.messageId);
    return message?.text.slice(assertion.source.start, assertion.source.end) === assertion.originalValue ? [assertion.value] : [];
  });
  const text = [...new Set(values)].join("\n");
  if (text.length > 6000) throw new ServiceError(422, "semantic_context_limit");
  return text.trim();
}
export function catalogueSemanticText(entry: CatalogueCase) {
  const disclosed = discloseCatalogueCase(entry);
  const text = `${disclosed.title}\n${disclosed.summary}`;
  if (text.length > 6000) throw new ServiceError(422, "semantic_context_limit");
  return text;
}
