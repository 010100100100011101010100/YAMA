import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { ConnectionSources } from "@/components/yama/ConnectionSources";
import { connectionsSchema } from "@/lib/connections";
import { connections, assertionId, messageId } from "./report-fixtures";

export function sourcedComparison() {
  return { ...connections(), sources: [{ assertionId, value: "paid" as const, originalValue: "no_reply" as const, corrected: true,
    origin: "client_proposal" as const,
    included: true, polarity: "affirmed" as const, status: "supporting" as const, verification: "not_verified" as const,
    quote: "मैंने भुगतान किया।", source: { messageId, start: 0, end: "मैंने भुगतान किया।".length }, evidence: null }],
    candidates: [{ id: "synthetic-case", title: "Fictional case", summary: "Authored example", synthetic: true as const,
      pattern: { shared: ["paid" as const], different: [], basis: "confirmed_pattern_tags" as const },
      linkage: { status: "not_assessed" as const, explanation: "Identity not assessed" }, differences: [],
      explanation: { catalogueVersion: "a".repeat(64), sourceKind: "authored_synthetic" as const, paths: [{ pattern: "paid" as const, assertionIds: [assertionId] }] } }] };
}
describe("comparison provenance", () => {
  it("rejects missing, negative or unrelated supporting references", () => {
    const comparison = sourcedComparison(); expect(connectionsSchema.safeParse(comparison).success).toBe(true);
    expect(connectionsSchema.safeParse({ ...comparison, sources: [] }).success).toBe(false);
    expect(connectionsSchema.safeParse({ ...comparison, sources: [{ ...comparison.sources[0], status: "contradicted", polarity: "contradicted" }] }).success).toBe(false);
  });
  it("shows exact Hindi wording and correction history through keyboard disclosures", async () => {
    const comparison = sourcedComparison(); const user = userEvent.setup();
    const { container } = render(<ConnectionSources result={comparison} language="hi" assertionIds={[assertionId]} />);
    const summary = screen.getByText(/मूल विवरण/); summary.focus(); await user.keyboard("{Enter}");
    expect(screen.getByText("मैंने भुगतान किया।")).toBeInTheDocument();
    expect(screen.getByText(/सुधारा गया/)).toBeInTheDocument();
    expect(document.activeElement).toBe(summary);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("explains withheld evidence even when no candidates match", () => {
    const comparison = sourcedComparison();
    render(<ConnectionSources result={{ ...comparison, candidates: [], sources: [{ ...comparison.sources[0], status: "excluded", included: false }] }} language="en" />);
    expect(screen.getByText(/Excluded by you/)).toBeInTheDocument();
    expect(screen.getByText(/not independently verified/)).toBeInTheDocument();
  });
  it("shows uncertain identifier evidence without treating it as a confirmed match", () => {
    const comparison = sourcedComparison();
    const quote = "@seller_demo_7";
    render(<ConnectionSources result={{ ...comparison, candidates: [], sources: [], identifierSources: [{ kind: "telegram", value: quote,
      key: `telegram:${quote}`, assertionId, source: { messageId, start: 0, end: quote.length }, quote, status: "uncertain", evidenceId: null }] }} language="en" />);
    expect(screen.getByText("Telegram · Uncertain")).toBeInTheDocument();
    expect(screen.getByText(quote, { selector: "blockquote" })).toBeInTheDocument();
    expect(screen.queryByText("Used as support")).not.toBeInTheDocument();
  });
});
