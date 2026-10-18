import { describe, expect, it } from "vitest";
import { createReport, confirmReport } from "@/server/reports/domain";
import { catalogueDetails, reportDetails } from "@/server/reports/retrieval-details";
import { demoCatalogue } from "@/server/reports/demo-cases";

const account = (text: string) => confirmReport(createReport("viewer", { synthetic: true, language: "en", narrative: text }, crypto.randomUUID()), { expectedRevision: 1, acknowledged: true });
describe("weak discovery details", () => {
  it("can discover from a single amount or explicitly reported alias without declaring identity", () => {
    expect(reportDetails(account("I paid INR18400. The agent was calling himself Lex Voss.")).map(detail => detail.key)).toEqual(["amount:18400", "reported_alias:lex voss"]);
    expect(reportDetails(account("Uska naam lex voss tha.")).map(detail => detail.key)).toEqual(["reported_alias:lex voss"]);
    expect(reportDetails(account("उसका नाम विक्रम मोरे है।"))[0]?.kind).toBe("reported_alias");
    const amount = account("18,400"); amount.assertions[0].field = "amount";
    expect(reportDetails(amount)[0]?.key).toBe("amount:18400");
  });
  it("does not use excluded, negated, uncertain or quoted details as discovery seeds", () => {
    expect(reportDetails(account('I did not pay INR18400. Maybe his name was Lex Voss. Someone forwarded "INR7200".'))).toEqual([]);
    const report = account("I paid INR18400."); report.assertions[0].included = false;
    expect(reportDetails(report)).toEqual([]);
    expect(reportDetails(account("I paid INR18400. Correction: I did not pay INR18400."))).toEqual([]);
  });
  it("indexes reported aliases from actual accounts, never the author answer key or reporter profile", () => {
    expect(catalogueDetails(demoCatalogue[0]).some(detail => detail.kind === "reported_alias")).toBe(false);
    expect(catalogueDetails(demoCatalogue[25]).find(detail => detail.kind === "reported_alias")?.value).toBe("lex voss");
    expect(JSON.stringify(catalogueDetails(demoCatalogue[25]))).not.toMatch(/rhea|danvers/iu);
  });
});
