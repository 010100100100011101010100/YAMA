import "server-only";
import type { PatternSource } from "@/lib/connections";
import { matchingPatterns, type Report } from "./domain";
import { ServiceError } from "@/server/errors";

export function explainPatternSources(report: Report): PatternSource[] {
  const supported = matchingPatterns(report);
  return report.assertions.filter(assertion => assertion.field === "pattern").map(assertion => {
    const message = report.messages.find(message => message.id === assertion.source.messageId);
    if (!message || assertion.source.start < 0 || assertion.source.start >= assertion.source.end || assertion.source.end > message.text.length)
      throw new ServiceError(503, "invalid_provenance");
    const evidence = message.evidenceSource;
    return { assertionId: assertion.id, value: assertion.value as PatternSource["value"], originalValue: assertion.originalValue as PatternSource["originalValue"],
      origin: assertion.origin, ...(assertion.agentSource ? { agentSource: assertion.agentSource } : {}),
      corrected: assertion.value !== assertion.originalValue, included: assertion.included, polarity: assertion.polarity,
      status: !assertion.included ? "excluded" : assertion.polarity !== "affirmed" ? assertion.polarity : supported.includes(assertion.value) ? "supporting" : "blocked",
      verification: "not_verified", quote: message.text.slice(assertion.source.start, assertion.source.end), source: assertion.source,
      evidence: evidence ? { id: evidence.evidenceId, sha256: evidence.sha256, textSha256: evidence.extraction?.textSha256 ?? null } : null };
  });
}
