import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createReport, reviseReport } from "@/server/reports/domain";
import { validateExtraction, acceptProposals, resultHash } from "@/server/agents/domain";

function fixture() {
  const report = createReport("owner", { synthetic: true, language: "hi", narrative: "📝 मैंने ₹18,000 दिए।" }, randomUUID());
  const start = report.messages[0].text.indexOf("₹18,000");
  const proposal = { field: "amount", value: "₹18,000", polarity: "affirmed", quote: "₹18,000",
    source: { messageId: report.messages[0].id, start, end: start + 7 } };
  return { report, proposal, output: { proposals: [proposal], skippedExisting: 0 } };
}
describe("agent extraction acceptance boundary", () => {
  it("preserves exact UTF-16 quotes and assigns trusted proposal IDs", () => {
    const { report, output } = fixture();
    const extraction = validateExtraction(report, output);
    expect(extraction.proposals[0]).toMatchObject(output.proposals[0]);
    expect(extraction.proposals[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(resultHash(extraction)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects model identity claims, source forgery and literal changes", () => {
    const { report, output } = fixture();
    for (const change of [ { ownerId: "foreign" }, { verification: "verified" }, { quote: "other" },
      { value: "₹12,000" }, { source: { ...output.proposals[0].source, messageId: randomUUID() } },
      { source: { ...output.proposals[0].source, start: 1 } }, { field: "pattern", value: "guilty" } ]) {
      expect(() => validateExtraction(report, { ...output, proposals: [{ ...output.proposals[0], ...change }] })).toThrow();
    }
  });
  it("rejects duplicates and proposals that revive corrected or excluded assertions", () => {
    const { report, output, proposal } = fixture();
    expect(() => validateExtraction(report, { ...output, proposals: [proposal, proposal] })).toThrow();
    const { quote, ...input } = proposal; void quote;
    const revised = reviseReport(report, { operation: "propose_assertions", expectedRevision: 1, proposals: [input] });
    revised.assertions.at(-1)!.value = "₹12,000"; revised.assertions.at(-1)!.included = false;
    expect(() => validateExtraction(revised, output)).toThrow();
  });
  it("user acceptance creates an unconfirmed draft with immutable source and adapter provenance", () => {
    const { report, output } = fixture();
    const extraction = validateExtraction(report, output);
    const accepted = acceptProposals(report, randomUUID(), extraction.proposals, 1);
    expect(accepted.revision).toBe(2); expect(accepted.confirmation).toBeNull();
    expect(accepted.messages).toEqual(report.messages);
    expect(accepted.assertions.at(-1)).toMatchObject({ origin: "agent_proposal", verification: "not_verified",
      value: "₹18,000", originalValue: "₹18,000", agentSource: { agent: "saathi", provider: "fixture", model: "authored-incident-v1", version: "1" } });
  });
  it("rejects old revisions and client attempts to supply trusted origin", () => {
    const { report, output, proposal } = fixture();
    expect(() => acceptProposals(report, randomUUID(), validateExtraction(report, output).proposals, 2)).toThrow("revision_conflict");
    expect(() => reviseReport(report, { operation: "propose_assertions", expectedRevision: 1, proposals: [{ ...proposal, origin: "agent_proposal" }] })).toThrow();
  });
  it("changes in proposal identity, source or quote change the receipt hash", () => {
    const { report, output } = fixture();
    const extraction = validateExtraction(report, output);
    const changed = structuredClone(extraction); changed.proposals[0].quote += "changed";
    expect(resultHash(changed)).not.toBe(resultHash(extraction));
  });
});
