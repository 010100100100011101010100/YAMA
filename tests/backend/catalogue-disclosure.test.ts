import { describe, expect, it } from "vitest";
import { demoCatalogue } from "@/server/reports/demo-cases";
import { discloseCatalogueCase, sharedEvidenceImage } from "@/server/reports/disclosure";
import { conversationText, hideReporterDetails, protectReply } from "@/server/dialogue/privacy";

describe("related report disclosure", () => {
  it("removes every reporter profile from all shared prose and filenames before model/browser use", () => {
    for (const entry of demoCatalogue) {
      const shared = discloseCatalogueCase({ ...entry, evidence: [{ id: crypto.randomUUID(), name: `${entry.reporter!.name}-conversation.png`, format: "png", sha256: "a".repeat(64) }] });
      const serialized = JSON.stringify(shared).toLowerCase();
      for (const value of [entry.reporter!.name, ...entry.reporter!.name.split(" "), entry.reporter!.city, entry.reporter!.occupation]) {
        expect(serialized, entry._id).not.toMatch(new RegExp(`\\b${value.toLowerCase()}\\b`, "u"));
      }
      expect(shared).not.toHaveProperty("reporter");
      expect(shared).not.toHaveProperty("sourceReportId");
      expect(shared).not.toHaveProperty("fictionalActor");
      expect(shared.evidence![0].name).toBe("Conversation image 1.png");
      expect(shared.resolution!.status).toBe(entry.resolution!.status);
    }
  });
  it("keeps matching suspect contacts and reported outcomes but removes the identifying introduction", () => {
    const shared = discloseCatalogueCase(demoCatalogue[0], ["+12025550101"]);
    expect(shared.title).toBe("Two shipping labels, no laptop");
    expect(shared.summary).toContain("+12025550101");
    expect(shared.summary).not.toContain("gadget1@yama-demo.invalid");
    expect(shared.summary).not.toContain("@yama_demo_gadget_01");
    expect(shared.summary).not.toContain("I'm");
    expect(shared.resolution!.summary).toContain("INR18400");
    expect(shared.resolution!.actions[0].description).toContain("[name hidden]");
  });
  it("does not publish unknown contacts or a reporter's age in a shared account", () => {
    const shared = discloseCatalogueCase(demoCatalogue[25]);
    expect(shared.summary).not.toContain("I'm 29");
    for (const identifier of demoCatalogue[25].identifiers!) expect(shared.summary).not.toContain(identifier.value);
    expect(shared.summary).toContain("I'm an adult");
  });
  it("makes a privacy copy from disclosure-filtered text, never raw source pixels", async () => {
    const image = await sharedEvidenceImage(demoCatalogue[0]);
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
  it("filters historical/generated reply prose and question fields, including first names", () => {
    const safe = protectReply({ text: "Emily Mosaic in Pune recovered INR18400. Tony has no refund.", question: {
      kind: "choice" as const, prompt: "Do you know Bruce Willi?", options: ["Emily", "No"], placeholder: "Tony Stank" } });
    expect(JSON.stringify(safe)).not.toMatch(/Emily|Mosaic|Pune|Tony|Bruce|Willi|Stank/);
    expect(safe.text).toContain("INR18400");
    expect(hideReporterDetails("The seller used +12025550101.")).toBe("The seller used +12025550101.");
    expect(conversationText("I’m Drishti. Three fictional examples have different reported outcomes.")).toBe("Three related reports have different reported outcomes.");
  });
});
