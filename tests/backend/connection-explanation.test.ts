import { describe, expect, it } from "vitest";
import { createReport, reviseReport } from "@/server/reports/domain";
import { explainPatternSources } from "@/server/reports/connection-explanation";

function account() {
  const report = createReport("private-owner", { synthetic: true, language: "hi", narrative: "काल्पनिक: मैंने भुगतान किया। जवाब नहीं आया।" }, crypto.randomUUID());
  return reviseReport(report, { operation: "propose_assertions", expectedRevision: 1, proposals: [
    { field: "pattern", value: "paid", source: report.assertions[0].source },
    { field: "pattern", value: "paid", polarity: "uncertain", source: report.assertions[0].source },
    { field: "pattern", value: "no_reply", source: report.assertions[0].source },
  ] });
}

describe("source-linked pattern explanations", () => {
  it("keeps blocked positive evidence and the exact negative source visible", () => {
    const report = account();
    const result = explainPatternSources(report);
    expect(result.map(source => source.status)).toEqual(["blocked", "uncertain", "supporting"]);
    expect(result.every(source => source.quote === report.messages[0].text)).toBe(true);
    expect(result[0].source).toEqual(report.assertions[0].source);
    expect(JSON.stringify(result)).not.toContain("private-owner");
  });
  it("retains corrections and excludes omitted statements from support", () => {
    let report = account();
    report = reviseReport(report, { operation: "correct_assertion", expectedRevision: 2, assertionId: report.assertions[2].id, included: false });
    report = reviseReport(report, { operation: "correct_assertion", expectedRevision: 3, assertionId: report.assertions[1].id, value: "promised_delivery" });
    const sources = explainPatternSources(report);
    expect(sources[0]).toMatchObject({ value: "promised_delivery", originalValue: "paid", corrected: true, status: "supporting" });
    expect(sources[1].status).toBe("excluded");
    expect(sources[2].value).toBe("no_reply");
  });
  it("fails closed on broken source ranges instead of inventing a quotation", () => {
    const report = account(); report.assertions[1].source.end = 9000;
    expect(() => explainPatternSources(report)).toThrow("invalid_provenance");
  });
});
