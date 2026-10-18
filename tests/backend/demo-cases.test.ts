import { describe, expect, it } from "vitest";
import { demoCatalogue, demoDatasetVersion, demoSourceReport, demoUuid } from "@/server/reports/demo-cases";
import { catalogueSchema, catalogueVersion } from "@/server/reports/catalogue-policy";
import { createReport, reviseReport, confirmReport } from "@/server/reports/domain";
import { identifierSources, matchingIdentifiers } from "@/server/reports/identifiers";

function confirmed(text: string) {
  return confirmReport(createReport("private-query-owner", { synthetic: true, language: "en", narrative: text }, crypto.randomUUID()), { expectedRevision: 1, acknowledged: true });
}
describe("rich synthetic incident catalogue", () => {
  it("contains40 richly sourced cases with fictional identities and differing outcomes", () => {
    expect(demoDatasetVersion).toBe("synthetic-incidents-v3");
    expect(demoCatalogue).toHaveLength(40);
    expect(new Set(demoCatalogue.map(entry => entry._id)).size).toBe(40);
    for (const entry of demoCatalogue) {
      expect(catalogueSchema.parse(entry)).toEqual(entry);
      expect(entry.story!.length).toBeGreaterThan(300);
      expect(entry.identifiers!.map(identifier => identifier.kind)).toEqual(["phone", "email", "telegram"]);
      expect(entry.identifiers![0].value).toMatch(/^\+120255501\d{2}$/);
      expect(entry.identifiers![1].value).toMatch(/\.invalid$/);
      expect(entry.identifiers![2].value).toMatch(/^@yama_demo_/);
      expect(entry.resolution!.actions.length).toBeGreaterThan(0);
      for (const identifier of entry.identifiers!) expect(entry.story!.slice(identifier.source.start, identifier.source.end)).toBe(identifier.source.quote);
    }
    expect(new Set(demoCatalogue.map(entry => entry.resolution!.status)).size).toBe(3);
    expect(demoCatalogue[0].identifiers!.map(identifier => identifier.value)).toEqual(demoCatalogue[1].identifiers!.map(identifier => identifier.value));
    expect(demoCatalogue[24].identifiers!.every(identifier => identifier.polarity !== "affirmed")).toBe(true);
  });
  it("uses distinct named personas and natural accounts instead of placeholder narration", () => {
    expect(demoCatalogue.slice(0, 3).map(entry => entry.reporter?.name)).toEqual(["Emily Mosaic", "Tony Stank", "Bruce Willi"]);
    expect(new Set(demoCatalogue.map(entry => entry.reporter?.name)).size).toBe(40);
    for (const entry of demoCatalogue) {
      expect(entry.reporter?.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(entry.reporter?.city.length).toBeGreaterThan(3);
      expect(entry.reporter?.occupation.length).toBeGreaterThan(5);
      expect(entry.title).toContain(entry.reporter!.name);
      expect(entry.story).toMatch(/^I'm /);
      expect(entry.story!.length).toBeGreaterThan(650);
      expect(entry.story).toContain("Chat excerpt");
      expect(entry.story).not.toMatch(/synthetic user report|fictional case|other (synthetic|demo) (case|report)|adhaar_testing|testing_name/i);
      expect(demoSourceReport(entry).reporter).toEqual(entry.reporter);
    }
  });
  it("keeps case identities stable while versioning source reports and upload keys", () => {
    const id = demoCatalogue[0]._id;
    expect(id).toBe("synthetic-demo-01-gadget-laptop");
    expect(demoCatalogue[13]._id).toBe("synthetic-demo-14-courier-address");
    expect(demoCatalogue[14]._id).toBe("synthetic-demo-15-courier-import");
    expect(demoCatalogue[0].sourceReportId).toBe(demoUuid(`${id}:report`));
    expect(demoUuid(`${id}:report`)).not.toBe(demoUuid(`${id}:report`, "synthetic-incidents-v1"));
    expect(demoUuid(`${id}:png-upload`)).not.toBe(demoUuid(`${id}:png-upload`, "synthetic-incidents-v1"));
  });
  it("binds receipts to changes in identifiers and reported resolutions", () => {
    const entry = demoCatalogue[0];
    expect(catalogueVersion(entry)).not.toBe(catalogueVersion({ ...entry, resolution: { ...entry.resolution!, summary: "A revised reported outcome" } }));
    expect(catalogueVersion(entry)).not.toBe(catalogueVersion({ ...entry, identifiers: entry.identifiers!.slice(1) }));
    expect(catalogueVersion(entry)).not.toBe(catalogueVersion({ ...entry, harmCategories: [] }));
    expect(catalogueSchema.safeParse({ ...entry, harmCategories: ["fraud", "fraud"] }).success).toBe(false);
  });
  it("covers every requested harm with recurring fictional actors across different harms", () => {
    const harms = new Set(demoCatalogue.flatMap(entry => entry.harmCategories ?? []));
    expect([...harms].sort()).toEqual(["bullying", "cybercrime", "fraud", "hate_speech", "money_laundering", "sexual_molestation", "terrorism"]);
    const victor = demoCatalogue.filter(entry => entry.fictionalActor?.id === "victor-morne");
    expect(victor.length).toBeGreaterThanOrEqual(3);
    expect(new Set(victor.flatMap(entry => entry.harmCategories ?? [])).size).toBeGreaterThanOrEqual(4);
    expect(demoCatalogue.slice(0, 3).every(entry => entry.fictionalActor?.name === "Lex Voss")).toBe(true);
    for (const entry of demoCatalogue.filter(entry => entry.fictionalActor)) expect(entry.fictionalActor!.basis).toBe("authored_fixture_truth");
  });
  it("keeps name-only and excluded-contact counterexamples out of the known-actor answer key", () => {
    for (const index of [24, 37, 38, 39]) expect(demoCatalogue[index].fictionalActor).toBeUndefined();
    expect(demoCatalogue[37].story).toContain("Victor Morne");
    expect(demoCatalogue[39].identifiers!.every(identifier => identifier.polarity === "contradicted")).toBe(true);
    for (const entry of demoCatalogue.slice(25)) {
      expect(entry.patterns).toEqual([]);
      expect(entry.story).not.toContain("Amount disputed: INR0");
    }
  });
});
describe("confirmed contact evidence", () => {
  it("does not turn an addressed product agent into a reported Telegram contact", () => {
    const report = confirmed("@Drishti, compare the seller's Telegram @yama_demo_gadget_01. @Saathi and @Disha can help too.");
    expect(matchingIdentifiers(report).map(identifier => identifier.value)).toEqual(["@yama_demo_gadget_01"]);
  });
  it("normalizes exact contacts with real source ranges without exposing private ownership", () => {
    const text = "Synthetic report: seller used +1 (202) 555-0101, SHOP@YAMA-DEMO.INVALID and Telegram @yama_demo_gadget_01.";
    const report = confirmed(text);
    expect(matchingIdentifiers(report).map(identifier => identifier.key)).toEqual(["phone:+12025550101", "email:shop@yama-demo.invalid", "telegram:@yama_demo_gadget_01"]);
    for (const source of identifierSources(report)) expect(text.slice(source.source.start, source.source.end)).toBe(source.quote);
    expect(JSON.stringify(identifierSources(report))).not.toContain("private-query-owner");
  });
  it("does not traverse unconfirmed, negated, uncertain, quoted, or contradicted contact claims", () => {
    const text = "I did not contact @yama_demo_gadget_01. Maybe shop@yama-demo.invalid was involved. The seller used +1 202 555 0101.";
    const report = createReport("owner", { synthetic: true, language: "en", narrative: text }, crypto.randomUUID());
    expect(matchingIdentifiers(report)).toEqual([]);
    const affirmed = confirmReport(report, { expectedRevision: 1, acknowledged: true });
    expect(matchingIdentifiers(affirmed).map(identifier => identifier.kind)).toEqual(["phone"]);
    const changed = reviseReport(affirmed, { operation: "propose_assertions", expectedRevision: 1, proposals: [{ field: "note", value: "+1 202 555 0101", polarity: "contradicted", source: { messageId: report.messages[0].id, start: text.indexOf("+1"), end: text.indexOf("+1") + 15 } }] });
    expect(matchingIdentifiers(confirmReport(changed, { expectedRevision: 2, acknowledged: true }))).toEqual([]);
    expect(matchingIdentifiers(confirmed('Quoted example: "@yama_demo_gadget_01".'))).toEqual([]);
  });
  it("does not use a contact outside the assertion's actual source range or invent corrected values", () => {
    let report = createReport("owner", { synthetic: true, language: "en", narrative: "The seller used @yama_demo_gadget_01." }, crypto.randomUUID());
    report = reviseReport(report, { operation: "correct_assertion", expectedRevision: 1, assertionId: report.assertions[0].id, value: "@yama_demo_unseen_99" });
    expect(matchingIdentifiers(confirmReport(report, { expectedRevision: 2, acknowledged: true }))).toEqual([]);
  });
});
