import type { DemoAction } from "./demo-state";
import type { SavedReport } from "./report-api";
import { exampleComplete } from "./report-session";

export function reportAction(report: SavedReport): Extract<DemoAction, { type: "sync-report" }> {
  return { type: "sync-report", reportId: report._id, revision: report.revision, example: exampleComplete(report),
    confirmedRevision: report.confirmation?.revision === report.revision ? report.revision : null,
    messages: report.messages.map(message => ({ ...message, agent: "you" })),
    details: report.assertions.map(assertion => ({ id: assertion.id, value: assertion.value, originalValue: assertion.originalValue,
      included: assertion.included, sourceId: assertion.source.messageId, field: assertion.field, polarity: assertion.polarity, agentSource: assertion.agentSource })),
  };
}
