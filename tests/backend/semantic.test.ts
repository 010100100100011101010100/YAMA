import { describe, expect, it } from "vitest";
import { createReport, confirmReport } from "@/server/reports/domain";
import { reportSemanticText, catalogueSemanticText } from "@/server/reports/semantic";
import { demoCatalogue } from "@/server/reports/demo-cases";

describe("semantic source boundary", () => {
  it("requires confirmation, keeps literal negation, and rejects excluded or changed assertions", () => {
    const draft = createReport("viewer", { synthetic: true, language: "en", narrative: "The parcel never arrived." }, crypto.randomUUID());
    expect(reportSemanticText(draft)).toBe("");
    const report = confirmReport(draft, { expectedRevision: 1, acknowledged: true });
    expect(reportSemanticText(report)).toBe("The parcel never arrived.");
    report.assertions[0].polarity = "uncertain"; expect(reportSemanticText(report)).toBe("");
    report.assertions[0].polarity = "affirmed"; report.assertions[0].included = false; expect(reportSemanticText(report)).toBe("");
    report.assertions[0].included = true; report.assertions[0].value = "Changed"; expect(reportSemanticText(report)).toBe("");
  });
  it("embeds the publication view, excluding reporter profiles, hidden contacts and author identity keys", () => {
    const entry = demoCatalogue[0], text = catalogueSemanticText(entry);
    expect(text).not.toContain(entry.reporter!.name);
    expect(text).not.toContain(entry.reporter!.city);
    for (const identifier of entry.identifiers ?? []) expect(text).not.toContain(identifier.value);
    expect(text).toContain("[contact hidden]");
  });
});
