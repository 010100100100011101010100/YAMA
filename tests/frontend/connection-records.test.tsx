import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import Connections from "@/components/yama/Connections";
import { createDemoState } from "@/lib/demo-state";
import { getSavedCopy } from "@/lib/persistence-copy";
import type { ConnectionsResult } from "@/lib/connections";
import { connections, assertionId, messageId } from "./report-fixtures";

function linkedCase(): ConnectionsResult["candidates"][number] {
  const quote = "The seller used seller-7@example.test.";
  return {
    id: "synthetic-related-case", title: "A related account", summary: "A buyer described a payment and missing delivery.", synthetic: true,
    pattern: { shared: [], different: ["paid"], basis: "confirmed_pattern_tags" },
    linkage: { status: "possible_shared_identifier", explanation: "The same identifier appears in both accounts. This does not prove the same person controls it." },
    differences: ["A different item was advertised."],
    explanation: { catalogueVersion: "a".repeat(64), sourceKind: "authored_synthetic", paths: [] },
    identifiers: [{ kind: "email", value: "seller-7@example.test", assertionIds: [assertionId], quote, source: { messageId, start: 0, end: quote.length },
      catalogueSource: { messageId: "00000000-0000-4000-8000-000000000004", start: 0, end: quote.length, quote } }],
    resolution: { status: "resolved", summary: "The buyer reported receiving a refund.", verification: "synthetic_user_report",
      actions: [{ kind: "bank_refund", description: "The buyer reported that their bank refunded the payment.", date: "2026-09-20", sourceMessageId: messageId }] },
    evidence: [{ id: "00000000-0000-4000-8000-000000000005", name: "payment-chat.png", format: "png", sha256: "b".repeat(64) }],
  };
}

function showCase(candidate = linkedCase(), language: "en" | "hi" | "hinglish" = "en") {
  const result = { ...connections(), candidates: [candidate] };
  return render(<Connections state={{ ...createDemoState(), backend: true, language, connections: result,
    task: { id: "comparison-task", revision: 1, status: "ready" } }} copy={getSavedCopy(language)} onRun={vi.fn()} onNext={vi.fn()} />);
}

describe("related case records", () => {
  it("distinguishes an exact identifier match from a shared story or a verified identity", async () => {
    showCase();
    expect(screen.getByText("seller-7@example.test")).toBeInTheDocument();
    expect(screen.getByText("Shared identifier")).toBeInTheDocument();
    expect(screen.getByText(/does not prove the same person controls it/)).toBeInTheDocument();
    expect(screen.queryByText("Not assessed")).not.toBeInTheDocument();
    const proof = screen.getByText("View matching statements");
    proof.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(screen.getAllByText("The seller used seller-7@example.test.")).toHaveLength(2);
    expect(document.activeElement).toBe(proof);
  });

  it("shows a reported outcome and dated action without claiming independent verification", () => {
    showCase();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText("The buyer reported receiving a refund.")).toBeInTheDocument();
    expect(screen.getByText(/not independently verified/)).toBeInTheDocument();
    expect(screen.getByText("The buyer reported that their bank refunded the payment.")).toBeInTheDocument();
    expect(screen.getByText("20 Sept 2026")).toHaveAttribute("dateTime", "2026-09-20");
  });

  it.each([
    ["phone", "+1-202-555-0146", "Phone"],
    ["telegram", "@seller_demo_7", "Telegram"],
  ] as const)("shows the exact %s value rather than a generic similarity claim", (kind, value, label) => {
    const candidate = linkedCase();
    candidate.identifiers = [{ ...candidate.identifiers![0], kind, value }];
    showCase(candidate);
    expect(screen.getByText(value)).toHaveAttribute("dir", "ltr");
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(["unresolved", "partially_resolved"] as const)("keeps %s outcomes explicit", status => {
    const candidate = linkedCase();
    candidate.resolution = { ...candidate.resolution!, status, actions: [] };
    showCase(candidate);
    expect(screen.getByText(status === "unresolved" ? "Unresolved" : "Partially resolved")).toBeInTheDocument();
    expect(screen.queryByText("Resolved")).not.toBeInTheDocument();
    expect(screen.getByText("No follow-up action was recorded.")).toBeInTheDocument();
  });

  it("discloses uploaded image metadata without exposing another account’s private file", () => {
    showCase();
    const evidence = screen.getByText("Uploaded evidence · 1").closest("details")!;
    expect(within(evidence).getByText("payment-chat.png")).toBeInTheDocument();
    expect(within(evidence).getByText("b".repeat(64))).toBeInTheDocument();
    expect(within(evidence).queryByRole("link")).not.toBeInTheDocument();
    expect(within(evidence).queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not invent outcomes or identifiers for older pattern-only records", () => {
    const candidate = linkedCase();
    delete candidate.resolution;
    delete candidate.identifiers;
    delete candidate.evidence;
    candidate.linkage = { status: "not_assessed", explanation: "Identity has not been assessed." };
    showCase(candidate);
    expect(screen.getByText("Not assessed")).toBeInTheDocument();
    expect(screen.queryByText("Reported outcome")).not.toBeInTheDocument();
    expect(screen.queryByText("Exact identifier matches")).not.toBeInTheDocument();
  });

  it("labels text attachments according to their actual format", () => {
    const candidate = linkedCase();
    candidate.evidence = [{ ...candidate.evidence![0], name: "chat-export.txt", format: "text" }];
    showCase(candidate);
    expect(screen.getByText("Text file")).toBeInTheDocument();
    expect(screen.queryByText("Image · PNG")).not.toBeInTheDocument();
  });

  it("updates the outcome as a person navigates between related records", async () => {
    const first = linkedCase();
    const second = { ...linkedCase(), id: "synthetic-unresolved-case", title: "A different related account",
      resolution: { ...first.resolution!, status: "unresolved" as const, summary: "The buyer is still awaiting an update.", actions: [] } };
    render(<Connections state={{ ...createDemoState(), backend: true, connections: { ...connections(), candidates: [first, second] },
      task: { id: "comparison-task", revision: 1, status: "ready" } }} copy={getSavedCopy("en")} onRun={vi.fn()} onNext={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Next example" });
    await userEvent.setup().click(next);
    expect(screen.getByText("Unresolved")).toBeInTheDocument();
    expect(screen.getByText("The buyer is still awaiting an update.")).toBeInTheDocument();
    expect(screen.queryByText("The buyer reported receiving a refund.")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(next);
  });

  it("keeps Hindi outcome labels and source disclosures accessible", async () => {
    const { container } = showCase(linkedCase(), "hi");
    expect(screen.getByText("सुलझा हुआ")).toBeInTheDocument();
    expect(screen.getByText("मिलते हुए मूल विवरण देखें")).toBeInTheDocument();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
