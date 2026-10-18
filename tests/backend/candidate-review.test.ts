import { describe, expect, it } from "vitest";
import { reviewedComparison } from "@/server/dialogue/runtime";
import type { ConnectionsResult } from "@/lib/connections";

const candidate = (id: string): ConnectionsResult["candidates"][number] => ({ id, title: id, summary: `${id} private candidate prose`, synthetic: true,
  pattern: { shared: ["paid"], different: [], basis: "confirmed_pattern_tags" }, linkage: { status: "not_assessed", explanation: "No identity finding" }, differences: [],
  explanation: { catalogueVersion: "a".repeat(64), sourceKind: "authored_synthetic", paths: [] } });
const comparison: ConnectionsResult = { status: "ready", reportId: crypto.randomUUID(), revision: 1, recipe: "confirmed-pattern-sources-v1", sources: [], candidates: [candidate("accepted"), candidate("rejected")] };
describe("review before generation", () => {
  it("removes omitted candidate contents before the reply context and receipt are built", () => {
    const checked = reviewedComparison(comparison, { cases: [{ id: "accepted", decision: "attach", reason: "Useful context" }, { id: "rejected", decision: "omit", reason: "Only a common amount overlaps" }] });
    expect(checked.comparison.candidates.map(candidate => candidate.id)).toEqual(["accepted"]);
    expect(JSON.stringify(checked.comparison)).not.toContain("rejected private candidate prose");
    expect(checked.review.cases).toHaveLength(2);
    expect(comparison.candidates).toHaveLength(2);
  });
  it.each([
    [{ id: "accepted", decision: "attach", reason: "Useful" }],
    [{ id: "accepted", decision: "attach", reason: "Useful" }, { id: "accepted", decision: "omit", reason: "Duplicate" }],
    [{ id: "accepted", decision: "attach", reason: "Useful" }, { id: "invented", decision: "attach", reason: "Unknown source" }],
  ].map(cases => [cases]))("fails closed for missing, duplicated or invented decisions", cases => {
    expect(() => reviewedComparison(comparison, { cases })).toThrow("invalid_candidate_review");
  });
});
