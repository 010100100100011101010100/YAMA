import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import Storyroom from "@/components/yama/Storyroom";
import { ReportApiError, type ConnectionsResult, type SavedReport } from "@/lib/report-api";
import { confirmedReport, connections, reportGateway, savedReport } from "./report-fixtures";
import { agentGateway, agentTask } from "./agent-fixtures";
import { AGENT_ADAPTER } from "@/lib/agent-task";

vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
vi.mock("@/lib/demo-adapter", () => ({ runDemoComparison: vi.fn(() => { throw new Error("Fixture comparison must not run with persistence"); }) }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const amountReport = (): SavedReport => {
  const report = savedReport(); report.assertions[0] = { ...report.assertions[0], field: "amount", value: "₹18,000", originalValue: "₹18,000" };
  return report;
};
describe("saved chat integration", () => {
  it("returns focus to extraction after saving the first fictional example", async () => {
    const user = userEvent.setup(), gateway = reportGateway();
    vi.mocked(gateway.create).mockImplementation(async (text, language) => {
      const saved = savedReport(); saved.language = language; saved.messages[0].text = text;
      saved.assertions[0] = { ...saved.assertions[0], value: text, originalValue: text, source: { messageId: saved.messages[0].id, start: 0, end: text.length } };
      return saved;
    });
    render(<Storyroom api={gateway} agentTasksApi={agentGateway()} />); await waitFor(() => expect(screen.getByRole("textbox", { name: "Your message" })).toBeEnabled());
    expect(screen.queryByText("Local database connected")).not.toBeInTheDocument();
    expect(screen.queryByText(/Fictional details only/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Your notes" }));
    await user.click(screen.getByRole("button", { name: "Add extraction example" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Extract proposals" })).toHaveFocus());
    expect(vi.mocked(gateway.create).mock.calls[0][0]).toContain("Fictional example: 📝");
  });
  it("persists selected proposals as an unconfirmed draft and restores review provenance", async () => {
    const user = userEvent.setup(), gateway = reportGateway(), agents = agentGateway(), original = confirmedReport();
    const task = agentTask(), proposal = task.result!.proposals[0];
    vi.mocked(gateway.restore).mockResolvedValue(original); vi.mocked(agents.list).mockResolvedValue([task]);
    const acceptance = deferred<SavedReport>(); vi.mocked(gateway.revise).mockReturnValue(acceptance.promise);
    render(<Storyroom api={gateway} agentTasksApi={agents} />);
    await screen.findByRole("button", { name: "Check my notes" });
    await user.click(screen.getByRole("button", { name: "Check my notes" }));
    await screen.findByText(proposal.quote, { selector: "blockquote" });
    await user.click(screen.getByRole("checkbox", { name: "Add Note" }));
    await user.click(screen.getByRole("checkbox", { name: /I reviewed the quoted sources/ }));
    await user.click(screen.getByRole("button", { name: "Add selected to draft" }));
    expect(screen.getByRole("button", { name: "Add selected to draft" })).toBeDisabled();
    expect(gateway.revise).toHaveBeenCalledWith(original._id, 1, { operation: "accept_agent_proposals", taskId: task.id,
      resultHash: task.resultHash, proposalIds: [proposal.id] });
    const saved = { ...savedReport(2), assertions: [...original.assertions, { ...original.assertions[0], id: crypto.randomUUID(), field: proposal.field,
      value: proposal.value, originalValue: proposal.value, origin: "agent_proposal" as const, source: proposal.source,
      agentSource: { taskId: task.id, agent: "saathi" as const, provider: AGENT_ADAPTER.provider, model: AGENT_ADAPTER.model, version: AGENT_ADAPTER.version } }] };
    vi.mocked(agents.list).mockResolvedValue([]);
    await act(async () => acceptance.resolve(saved));
    expect(screen.getByRole("button", { name: "Extract proposals" })).toHaveFocus();
    expect(screen.getByText("Saathi · authored fixture · accepted by you")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Find related reports" })).not.toBeInTheDocument();
    expect(gateway.confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "These details match what I want to say." }));
    vi.mocked(gateway.confirm).mockResolvedValue({ ...saved, confirmation: { revision: 2, kind: "user_confirmed" } });
    await user.click(screen.getByRole("button", { name: "Confirm my notes" }));
    expect(await screen.findByRole("button", { name: "Find related reports" })).toBeEnabled();
    expect(gateway.confirm).toHaveBeenCalledWith(original._id, 2);
  });
  it("restores exact words, waits for saved corrections and confirmation, and restores edit focus", async () => {
    const user = userEvent.setup(); const gateway = reportGateway(); const report = amountReport();
    vi.mocked(gateway.restore).mockResolvedValue(report);
    const correction = deferred<SavedReport>(); vi.mocked(gateway.revise).mockReturnValue(correction.promise);
    const confirmation = deferred<SavedReport>(); vi.mocked(gateway.confirm).mockReturnValue(confirmation.promise);
    render(<StrictMode><Storyroom api={gateway} agentTasksApi={agentGateway()} /></StrictMode>);
    await screen.findByRole("button", { name: "Check my notes" });
    expect(within(screen.getByRole("log")).getByText(/काल्पनिक घटना/).textContent).toBe(report.messages[0].text);
    await user.click(screen.getByRole("button", { name: "Check my notes" }));
    await user.click(screen.getByRole("button", { name: "Edit Amount" }));
    await user.clear(screen.getByRole("textbox", { name: "Amount" })); await user.type(screen.getByRole("textbox", { name: "Amount" }), "₹8,000");
    await user.click(screen.getByRole("button", { name: "Save Amount" }));
    expect(screen.getByRole("button", { name: "Save Amount" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm my notes" })).toBeDisabled();
    const corrected: SavedReport = { ...report, revision: 2, assertions: [{ ...report.assertions[0], value: "₹8,000" }] };
    await act(async () => correction.resolve(corrected));
    expect(screen.getByRole("button", { name: "Edit Amount" })).toHaveFocus();
    await user.click(screen.getByRole("checkbox", { name: "These details match what I want to say." }));
    await user.click(screen.getByRole("button", { name: "Confirm my notes" }));
    expect(screen.queryByRole("button", { name: "Find related reports" })).not.toBeInTheDocument();
    await act(async () => confirmation.resolve({ ...corrected, confirmation: { revision: 2, kind: "user_confirmed" } }));
    expect(screen.getByRole("button", { name: "Find related reports" })).toBeEnabled();
    expect(gateway.confirm).toHaveBeenCalledWith(report._id, 2);
  }, 15000);
  it("keeps a failed message draft and retries the same creation request", async () => {
    const user = userEvent.setup(); const gateway = reportGateway();
    vi.mocked(gateway.create).mockRejectedValueOnce(new ReportApiError("network_error"));
    render(<Storyroom api={gateway} agentTasksApi={agentGateway()} />); await waitFor(() => expect(screen.getByRole("textbox", { name: "Your message" })).toBeEnabled());
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.change(input, { target: { value: savedReport().messages[0].text } });
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    expect(input).toHaveValue(savedReport().messages[0].text); expect(within(screen.getByRole("log")).queryByText(/काल्पनिक घटना/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(vi.mocked(gateway.create).mock.calls[0][2]).toBe(vi.mocked(gateway.create).mock.calls[1][2]);
    expect(within(screen.getByRole("log")).getAllByText(/काल्पनिक घटना/)).toHaveLength(1); expect(input).toHaveFocus();
  });
  it("keeps a failed correction open with the user's wording", async () => {
    const user = userEvent.setup(); const gateway = reportGateway(); const report = amountReport();
    vi.mocked(gateway.restore).mockResolvedValue(report); vi.mocked(gateway.get).mockResolvedValue(report);
    vi.mocked(gateway.revise).mockRejectedValue(new ReportApiError("network_error"));
    render(<Storyroom api={gateway} agentTasksApi={agentGateway()} />); await screen.findByRole("button", { name: "Check my notes" });
    await user.click(screen.getByRole("button", { name: "Check my notes" })); await user.click(screen.getByRole("button", { name: "Edit Amount" }));
    const input = screen.getByRole("textbox", { name: "Amount" }); await user.clear(input); await user.type(input, "₹8,000");
    await user.click(screen.getByRole("button", { name: "Save Amount" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Amount" })).toBeEnabled());
    expect(input).toHaveValue("₹8,000"); expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("couldn’t be saved");
  });
  it("ignores a canceled real comparison response", async () => {
    const user = userEvent.setup(); const gateway = reportGateway(); vi.mocked(gateway.restore).mockResolvedValue(confirmedReport());
    const work = deferred<ConnectionsResult>(); vi.mocked(gateway.connections).mockReturnValue(work.promise);
    render(<Storyroom api={gateway} agentTasksApi={agentGateway()} />);
    await user.click(await screen.findByRole("button", { name: "Stop comparison" }));
    await act(async () => work.resolve(connections()));
    expect(screen.queryByRole("button", { name: "See what matches" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
  it("renders an actual empty graph result without the authored fixture claims", async () => {
    const user = userEvent.setup(); const gateway = reportGateway(); vi.mocked(gateway.restore).mockResolvedValue(confirmedReport());
    const { container } = render(<Storyroom api={gateway} agentTasksApi={agentGateway()} />);
    await user.click(await screen.findByRole("button", { name: "See what matches" }));
    expect(screen.getByText(/There are no confirmed pattern or identifier details/)).toBeInTheDocument();
    expect(screen.queryByText("Example 1 + Example 2")).not.toBeInTheDocument();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations.map(item => item.id)).toEqual([]);
  }, 10000);
  it("shows server-returned cases and support controls without inventing similarity scores", async () => {
    const user = userEvent.setup(); const gateway = reportGateway(); const report = confirmedReport();
    report.assertions.push({ ...report.assertions[0], id: crypto.randomUUID(), field: "pattern", value: "paid", originalValue: "paid", origin: "client_proposal" });
    vi.mocked(gateway.restore).mockResolvedValue(report);
    const support = report.assertions.at(-1)!;
    vi.mocked(gateway.connections).mockResolvedValue({ ...connections(), sources: [{ assertionId: support.id, value: "paid", originalValue: "paid", corrected: false,
      origin: "client_proposal",
      included: true, polarity: "affirmed", status: "supporting", verification: "not_verified", quote: report.messages[0].text, source: support.source, evidence: null }],
      candidates: [{ id: "actual-case", title: "Returned catalogue case", summary: "An authored case returned by the server.", synthetic: true,
      pattern: { shared: ["paid"], different: ["no_reply"], basis: "confirmed_pattern_tags" }, linkage: { status: "not_assessed", explanation: "No identity evidence" }, differences: ["Different item"],
      explanation: { sourceKind: "authored_synthetic", catalogueVersion: "a".repeat(64), paths: [{ pattern: "paid", assertionIds: [support.id] }] } }] });
    const { container } = render(<Storyroom api={gateway} agentTasksApi={agentGateway()} />);
    await user.click(await screen.findByRole("button", { name: "See what matches" }));
    expect(screen.getByText("Returned catalogue case")).toBeInTheDocument(); expect(screen.getByText("Different item")).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Your notes" }));
    expect(screen.getByRole("combobox", { name: "Support for this detail: Payment made" })).toHaveValue("affirmed");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations.map(item => item.id)).toEqual([]);
  }, 10000);
  it("can retry initial restoration after the local server is unavailable", async () => {
    const user = userEvent.setup(); const gateway = reportGateway(); vi.mocked(gateway.restore).mockRejectedValueOnce(new ReportApiError("network_error"));
    render(<Storyroom api={gateway} agentTasksApi={agentGateway()} />);
    await user.click(await screen.findByRole("button", { name: "Reload saved notes" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your message" })).toBeEnabled()); expect(gateway.restore).toHaveBeenCalledTimes(2);
  });
});
