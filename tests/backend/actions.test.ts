import { describe, expect, it } from "vitest";
import { createReport, reviseReport } from "@/server/reports/domain";
import { buildActionPreview } from "@/server/actions/domain";
import { assistanceCatalogue } from "@/server/assistance/catalogue";

describe("private action previews", () => {
  it("preserves corrections, uncertainty and exact Hindi sources without publishing omissions", () => {
    let report = createReport("private-owner", { synthetic: true, language: "hi", narrative: "काल्पनिक: ₹8000 दिए। जवाब शायद नहीं आया।" }, crypto.randomUUID());
    report = reviseReport(report, { operation: "propose_assertions", expectedRevision: 1, proposals: [
      { field: "amount", value: "₹18000", source: report.assertions[0].source },
      { field: "pattern", value: "no_reply", polarity: "uncertain", source: report.assertions[0].source },
    ] });
    report = reviseReport(report, { operation: "correct_assertion", expectedRevision: 2, assertionId: report.assertions[1].id, value: "₹8000" });
    report = reviseReport(report, { operation: "correct_assertion", expectedRevision: 3, assertionId: report.assertions[0].id, included: false });
    const preview = buildActionPreview(report, []);
    expect(preview.summary[0]).toMatchObject({ value: "₹8000", originalValue: "₹18000", quote: report.messages[0].text });
    expect(preview.summary[1].polarity).toBe("uncertain");
    expect(preview.omittedAssertionIds).toEqual([report.assertions[0].id]);
    expect(preview).toMatchObject({ confirmation: "unconfirmed", submitted: false, verification: "not_independently_verified" });
    expect(JSON.stringify(preview)).not.toContain("private-owner");
  });
  it("binds the receipt to file status, hashes, visibility and confirmation", () => {
    const report = createReport("owner", { synthetic: true, language: "en", narrative: "Fictional record" }, crypto.randomUUID());
    const file = { id: crypto.randomUUID(), name: "note.txt", size: 10, sha256: "a".repeat(64), textSha256: null, format: "text" as const, status: "stored" as const, reviewed: false };
    const receipt = buildActionPreview(report, [file]).receipt;
    expect(buildActionPreview(report, [{ ...file, status: "ready" }]).receipt).not.toBe(receipt);
    expect(buildActionPreview(report, []).receipt).not.toBe(receipt);
    expect(buildActionPreview({ ...report, confirmation: { revision: 1, kind: "user_confirmed", confirmedAt: new Date() } }, [file]).receipt).not.toBe(receipt);
  });
  it("rejects broken provenance instead of inventing source text", () => {
    const report = createReport("owner", { synthetic: true, language: "en", narrative: "Fictional" }, crypto.randomUUID());
    report.assertions[0].source.end = 100;
    expect(() => buildActionPreview(report, [])).toThrow("invalid_provenance");
  });
});

describe("dated assistance", () => {
  it("is independent of reports, confirmation and purchases, in all three languages", () => {
    for (const language of ["en", "hi", "hinglish"] as const) {
      const catalogue = assistanceCatalogue(language, new Date("2026-10-11T12:00:00Z"));
      expect(catalogue).toMatchObject({ jurisdiction: "IN", free: true, language });
      expect(catalogue.options.map(option => option.contact)).toEqual(["112", "1930", "1915"]);
      expect(catalogue.options.every(option => option.status === "current" && option.sourceUrl.startsWith("https://"))).toBe(true);
    }
  });
  it("withdraws stale contact recommendations and rejects dates before verification", () => {
    for (const date of ["2027-01-09T00:00:00Z", "2026-10-10T00:00:00Z"]) {
      const catalogue = assistanceCatalogue("en", new Date(date));
      expect(catalogue.options.every(option => option.status === "needs_review" && option.contact === null)).toBe(true);
    }
  });
});
