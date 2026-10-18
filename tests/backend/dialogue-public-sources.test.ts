import { describe, expect, it } from "vitest";
import { publicLookupTopic } from "@/server/dialogue/public-sources";

describe("bounded public lookup intent", () => {
  it("uses generic topics only for an explicit public-source request to a permitted role", () => {
    expect(publicLookupTopic("Search the web for official sources about refunds. My phone is private.", "disha")).toBe("consumer_reporting");
    expect(publicLookupTopic("Find official links for cybercrime reporting.", "drishti")).toBe("cyber_reporting");
    expect(publicLookupTopic("आधिकारिक जानकारी से खाता सुरक्षा बताएं।", "disha")).toBe("cyber_safety");
    expect(publicLookupTopic("The seller used this number. Find matching cases.", "drishti")).toBeNull();
    expect(publicLookupTopic("Search the web.", "saathi")).toBeNull();
  });
});
