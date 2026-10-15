import { vi } from "vitest";
import type { AgentApi } from "@/lib/agent-api";
import type { AgentTask } from "@/lib/agent-task";
import { AGENT_ADAPTER } from "@/lib/agent-task";
import { savedReport } from "./report-fixtures";

export function agentTask(status: AgentTask["status"] = "ready"): AgentTask {
  const report = savedReport();
  const quote = "सामान नहीं आया।"; const start = report.messages[0].text.indexOf(quote);
  const result = { proposals: [{ id: "00000000-0000-4000-8000-000000000007", field: "note" as const, value: quote, polarity: "affirmed" as const, quote,
    source: { messageId: report.messages[0].id, start, end: start + quote.length } }], skippedExisting: 0 };
  return { id: "00000000-0000-4000-8000-000000000006", reportId: report._id, revision: 1, agent: "saathi", tool: "propose_draft_assertions", status,
    attempts: 1, adapter: { ...AGENT_ADAPTER }, result: status === "ready" ? result : null, resultHash: status === "ready" ? "a".repeat(64) : null, accepted: null, errorCode: null };
}
export function agentGateway(): AgentApi {
  return { list: vi.fn(async () => []), start: vi.fn(async () => agentTask("queued")), cancel: vi.fn(async () => agentTask("canceled")) };
}
