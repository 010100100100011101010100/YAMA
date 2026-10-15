import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { AGENT_ADAPTER, adapterSchema, agentSourceSchema, extractionSchema, extractionResultSchema, type AgentAdapter, type AgentProposal, type ExtractionResult } from "@/lib/agent-task";
import { parse, patternKeys, reviseReport, type Report } from "@/server/reports/domain";
import { ServiceError } from "@/server/errors";

function boundary(text: string, offset: number) {
  return !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]));
}
export function validateExtraction(report: Report, input: unknown): ExtractionResult {
  const parsed = parse(extractionSchema, input);
  const seen = new Set<string>();
  for (const proposal of parsed.proposals) {
    const message = report.messages.find(message => message.id === proposal.source.messageId);
    const { start, end } = proposal.source;
    const key = JSON.stringify([proposal.field, proposal.source.messageId, start, end]);
    if (!message || start >= end || end > message.text.length || !boundary(message.text, start) || !boundary(message.text, end)
        || message.text.slice(start, end) !== proposal.quote || !proposal.value.trim()
        || (proposal.field === "pattern" ? !patternKeys.some(pattern => pattern === proposal.value) : proposal.value !== proposal.quote)
        || seen.has(key) || report.assertions.some(assertion => assertion.field === proposal.field
          && assertion.source.messageId === proposal.source.messageId && assertion.source.start === start && assertion.source.end === end)) {
      throw new ServiceError(422, "invalid_model_output");
    }
    seen.add(key);
  }
  return { proposals: parsed.proposals.map(proposal => ({ ...proposal, id: randomUUID() })), skippedExisting: parsed.skippedExisting };
}
export function resultHash(extraction: ExtractionResult, adapter: AgentAdapter = AGENT_ADAPTER) {
  return createHash("sha256").update(JSON.stringify({ adapter: adapterSchema.parse(adapter), result: extractionResultSchema.parse(extraction) })).digest("hex");
}
export function acceptProposals(report: Report, taskId: string, proposals: AgentProposal[], expectedRevision: number, adapter: AgentAdapter = AGENT_ADAPTER) {
  const provenance = adapterSchema.parse(adapter);
  validateExtraction(report, { proposals: proposals.map(proposal => {
    const { id, ...candidate } = proposal; void id; return candidate;
  }), skippedExisting: 0 });
  const next = reviseReport(report, { operation: "propose_assertions", expectedRevision,
    proposals: proposals.map(({ field, value, polarity, source }) => ({ field, value, polarity, source })) });
  for (const assertion of next.assertions.slice(report.assertions.length)) {
    assertion.origin = "agent_proposal";
    assertion.agentSource = agentSourceSchema.parse({ taskId, agent: "saathi", provider: provenance.provider, model: provenance.model, version: provenance.version });
  }
  return next;
}
