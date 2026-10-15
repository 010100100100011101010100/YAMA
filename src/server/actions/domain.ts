import "server-only";
import { createHash } from "node:crypto";
import { actionPreviewSchema, type ActionFile } from "@/lib/actions";
import type { Report } from "@/server/reports/domain";
import { ServiceError } from "@/server/errors";

export function buildActionPreview(report: Report, files: ActionFile[]) {
  const payload = { recipe: "private-actions-v1" as const, reportId: report._id, revision: report.revision, language: report.language,
    confirmation: report.confirmation?.revision === report.revision ? "user_confirmed" as const : "unconfirmed" as const,
    verification: "not_independently_verified" as const, submitted: false as const,
    summary: report.assertions.filter(assertion => assertion.included).map(assertion => {
      const message = report.messages.find(message => message.id === assertion.source.messageId);
      if (!message || assertion.source.start < 0 || assertion.source.start >= assertion.source.end || assertion.source.end > message.text.length) throw new ServiceError(503, "invalid_provenance");
      const evidence = message.evidenceSource;
      return { id: assertion.id, field: assertion.field, value: assertion.value, originalValue: assertion.originalValue, polarity: assertion.polarity,
        origin: assertion.origin, ...(assertion.agentSource ? { agentSource: assertion.agentSource } : {}), source: assertion.source,
        quote: message.text.slice(assertion.source.start, assertion.source.end),
        evidence: evidence ? { id: evidence.evidenceId, sha256: evidence.sha256, textSha256: evidence.extraction?.textSha256 ?? null, available: files.some(file => file.id === evidence.evidenceId) } : null };
    }), omittedAssertionIds: report.assertions.filter(assertion => !assertion.included).map(assertion => assertion.id),
    files: [...files].sort((left, right) => left.id.localeCompare(right.id)),
  };
  const receipt = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return actionPreviewSchema.parse({ ...payload, receipt, review: { status: "unreviewed", reviewedAt: null } });
}
