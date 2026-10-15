import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ThinkingState from "@/components/primitives/ThinkingState";
import StreamingText from "@/components/primitives/StreamingText";
import ApprovalCard from "@/components/primitives/ApprovalCard";
import ToolChips from "@/components/primitives/ToolChips";
import FilterTable from "@/components/primitives/FilterTable";
import RecommendationCard from "@/components/primitives/RecommendationCard";
import PromptBar from "@/components/primitives/PromptBar";
import TaskStatus from "@/components/yama/TaskStatus";
import { getCopy } from "@/lib/copy";

describe("supplied BeautifulUI components", () => {
  it("keeps thinking tied to work status, with no timed success", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<ThinkingState working active="Checking fixtures" done="Ready" rows={[{ primary: "Read reviewed account" }]} />);
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByRole("button", { name: "Checking fixtures" })).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(screen.getByRole("button", { name: "Checking fixtures" }));
      expect(screen.getByText("Read reviewed account")).toBeVisible();
      rerender(<ThinkingState working={false} active="Checking fixtures" done="Ready" rows={[{ primary: "Read reviewed account" }]} />);
      expect(screen.getByRole("button", { name: "Ready" })).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("renders supplied stream text immediately without changing whitespace or replaying", () => {
    const stop = vi.fn();
    const { rerender } = render(<StreamingText text={"मेरी बात\nI am unsure."} streaming onStop={stop} stopLabel="Stop reply" />);
    expect(screen.getByText(/मेरी बात/).textContent).toBe("मेरी बात\nI am unsure.");
    fireEvent.click(screen.getByRole("button", { name: "Stop reply" }));
    expect(stop).toHaveBeenCalledOnce();
    rerender(<StreamingText text={"मेरी बात\nI am unsure. Keep the date uncertain."} />);
    expect(screen.getByText(/Keep the date uncertain/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Stop reply" })).not.toBeInTheDocument();
  });

  it("requires an explicit approval and only displays confirmed state from the application", () => {
    const submit = vi.fn();
    const props = { questions: [{ q: "Check this account", options: ["I reviewed it"], type: "check" as const }], labels: { send: "Confirm", sentMessage: "Confirmed" }, onSubmitted: submit };
    const { rerender } = render(<ApprovalCard {...props} />);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I reviewed it" }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(submit).toHaveBeenCalledWith({ 0: [0] });
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
    const confirmation = screen.getByRole("button", { name: "Confirm" });
    confirmation.focus();
    rerender(<ApprovalCard {...props} confirmed />);
    expect(screen.getByText("Confirmed")).toBeVisible();
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveAttribute("aria-disabled", "true");
  });

  it("shows actual tool rows immediately and expands their details", () => {
    render(<ToolChips labels={{ header: "Fixture comparison" }} steps={[{ icon: "read", label: "Read", chip: "Example 2", detail: [{ text: "Fictional account, no web request" }] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Read Example 2" }));
    expect(screen.getByText("Fictional account, no web request")).toBeVisible();
  });

  it("derives filter counts from records and removes filtered rows from the accessible table", () => {
    render(<FilterTable rows={[{ task: "Included note", date: "Source 1", status: "done", owner: "Saathi" }, { task: "Excluded note", date: "Source 2", status: "todo", owner: "Saathi" }]} labels={{ columns: { task: "Detail", date: "Source", status: "State", owner: "Agent" }, all: "All", todo: "Excluded", progress: "Checking", done: "Included", region: "Notes" }} />);
    expect(screen.getByRole("button", { name: "All 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Included 1" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Included note")).toBeVisible();
    expect(within(table).queryByText("Excluded note")).not.toBeInTheDocument();
  });

  it("runs the chosen recommendation action without inventing an accepted state", () => {
    const confirm = vi.fn();
    render(<RecommendationCard options={[{ key: "keep", body: "Keep originals", short: "Keep records", label: "Available now", cta: "Open files" }, { key: "report", body: "Save reviewed account", short: "Save report", label: "Local download", cta: "Download" }]} onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Alternatives" }));
    fireEvent.click(screen.getByRole("button", { name: /Save report/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(confirm).toHaveBeenCalledWith("report");
    expect(screen.queryByText("Accepted")).not.toBeInTheDocument();
  });

  it("opens a real prompt shortcut with the keyboard and preserves text until the action is picked", () => {
    const pick = vi.fn(); const change = vi.fn(); const send = vi.fn();
    render(<PromptBar value="My note /review" onChange={change} onSend={send} onAttach={vi.fn()} error={false} copy={getCopy("en")} commandActions={[{ key: "review", name: "/review", description: "Open notes", onPick: pick }]} />);
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(pick).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(pick).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith("My note ");
    expect(send).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it("does not expose authored fixture comparisons when an account no longer matches", () => {
    render(<TaskStatus comparisonAvailable={false} task={{ id: "custom", revision: 2, status: "ready" }} copy={getCopy("en")} onCancel={vi.fn()} onRetry={vi.fn()} onShow={vi.fn()} />);
    expect(screen.queryByText("Payment, promise, then silence")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See what matches" })).toBeInTheDocument();
  });
});
