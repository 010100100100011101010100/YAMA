import { describe, expect, it } from "vitest";
import { createReport, reviseReport, confirmReport, matchingPatterns } from "@/server/reports/domain";

const narration = "I paid for a phone. It never arrived.";
function draft() { return createReport("owner-a", { synthetic: true, language: "en", narrative: narration }, "request-key"); }

describe("report provenance and confirmation", () => {
  it("preserves the original narration and exact source range", () => {
    const report = draft();
    expect(report.assertions[0].originalValue).toBe(narration);
    expect(report.assertions[0].source).toEqual({ messageId: report.messages[0].id, start: 0, end: narration.length });
    expect(report.confirmation).toBeNull();
  });
  it("preserves whitespace and Hindi script rather than rewriting the source", () => {
    const narrative = "  मैंने सामान मँगाया।\nडिलीवरी नहीं हुई।  ";
    const report = createReport("owner-a", { synthetic: true, language: "hi", narrative }, "key");
    expect(report.messages[0].text).toBe(narrative);
    expect(report.assertions[0].verification).toBe("not_verified");
  });
  it("requires explicit acknowledgement of the current revision", () => {
    expect(() => confirmReport(draft(), { expectedRevision: 2, acknowledged: true })).toThrow("revision_conflict");
    expect(() => confirmReport(draft(), { expectedRevision: 1, acknowledged: false })).toThrow();
    const confirmed = confirmReport(draft(), { expectedRevision: 1, acknowledged: true });
    expect(confirmed.confirmation?.revision).toBe(1);
    expect(confirmReport(confirmed, { expectedRevision: 1, acknowledged: true })).toBe(confirmed);
  });
  it("invalidates confirmation after a correction and retains the original", () => {
    const confirmed = confirmReport(draft(), { expectedRevision: 1, acknowledged: true });
    const corrected = reviseReport(confirmed, {
      operation: "correct_assertion", expectedRevision: 1,
      assertionId: confirmed.assertions[0].id, value: "The delivery arrived late.",
    });
    expect(corrected.revision).toBe(2);
    expect(corrected.confirmation).toBeNull();
    expect(corrected.assertions[0].originalValue).toBe(narration);
    expect(confirmed.messages).toEqual(corrected.messages);
  });
  it("rejects forged source ranges, unknown fields and stale changes", () => {
    const report = draft();
    expect(() => reviseReport(report, { operation: "propose_assertions", expectedRevision: 1, proposals: [{ field: "pattern", value: "paid", source: { messageId: report.messages[0].id, start: 0, end: 9999 } }] })).toThrow("invalid_provenance");
    expect(() => reviseReport(report, { operation: "add_message", expectedRevision: 2, text: "Update" })).toThrow("revision_conflict");
    expect(() => reviseReport(report, { operation: "add_message", expectedRevision: 1, text: "Update", ownerId: "other" })).toThrow();
  });
  it("does not turn raw narration or contradictory evidence into graph matches", () => {
    const report = draft();
    expect(matchingPatterns(report)).toEqual([]);
    const proposed = reviseReport(report, { operation: "propose_assertions", expectedRevision: 1, proposals: [
      { field: "pattern", value: "paid", source: report.assertions[0].source },
      { field: "pattern", value: "paid", polarity: "contradicted", source: report.assertions[0].source },
      { field: "pattern", value: "no_reply", polarity: "uncertain", source: report.assertions[0].source },
    ] });
    expect(matchingPatterns(proposed)).toEqual([]);
  });
  it("requires an included assertion and caps report growth", () => {
    const report = draft();
    const excluded = reviseReport(report, { operation: "correct_assertion", expectedRevision: 1, assertionId: report.assertions[0].id, included: false });
    expect(() => confirmReport(excluded, { expectedRevision: 2, acknowledged: true })).toThrow("nothing_to_confirm");
    expect(() => createReport("owner", { synthetic: false, language: "en", narrative: "real" }, "key")).toThrow();
    const full = { ...report, messages: Array.from({ length: 50 }, () => report.messages[0]) };
    expect(() => reviseReport(full, { operation: "add_message", expectedRevision: 1, text: "Another" })).toThrow("report_limit");
  });
});
