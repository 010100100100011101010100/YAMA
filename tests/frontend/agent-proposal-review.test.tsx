import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AgentProposalReview from "@/components/yama/AgentProposalReview";
import { agentGateway, agentTask } from "./agent-fixtures";
import { savedReport } from "./report-fixtures";

describe("owned proposal preview and explicit acceptance", () => {
  it("labels an OpenAI receipt honestly without claiming the content is an authored fixture", async () => {
    const api = agentGateway(); const task = agentTask(); task.adapter = { provider: "openai", model: "test-model", version: "1", live: true };
    vi.mocked(api.list).mockResolvedValue([task]);
    render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    expect(await screen.findByText("OpenAI proposals")).toBeVisible();
    expect(screen.queryByText("Authored fixture")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add selected to draft" })).toBeDisabled();
  });
  it("labels a signed-in Codex receipt without calling it an OpenAI API or authored fixture response", async () => {
    const api = agentGateway(); const task = agentTask(); task.adapter = { provider: "codex", model: "codex-session", version: "1", live: true };
    vi.mocked(api.list).mockResolvedValue([task]);
    render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    expect(await screen.findByText("Codex session proposals")).toBeVisible();
    expect(screen.queryByText("OpenAI proposals")).not.toBeInTheDocument();
    expect(screen.queryByText("Authored fixture")).not.toBeInTheDocument();
  });
  it("restores quotes and requires selection plus acknowledgement before acceptance", async () => {
    const user = userEvent.setup(), api = agentGateway(), onAccept = vi.fn(async () => true);
    vi.mocked(api.list).mockResolvedValue([agentTask()]);
    render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={onAccept} onExample={async () => true} />);
    expect(await screen.findByText("सामान नहीं आया।", { selector: "blockquote" })).toBeVisible();
    const submit = screen.getByRole("button", { name: "Add selected to draft" }); expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Add Note" }));
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I reviewed the quoted sources/ }));
    await user.click(submit);
    expect(onAccept).toHaveBeenCalledWith(agentTask().id, "a".repeat(64), [agentTask().result!.proposals[0].id]);
    expect(screen.getByRole("button", { name: "Extract proposals" })).toHaveFocus();
  });
  it("keeps focus on the task control when polling completes", async () => {
    const api = agentGateway(); let reads = 0;
    vi.mocked(api.list).mockImplementation(async () => [reads++ ? agentTask() : agentTask("running")]);
    render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} pollInterval={10} />);
    const control = await screen.findByRole("button", { name: "Cancel extraction" }); control.focus();
    await screen.findByText("सामान नहीं आया।", { selector: "blockquote" });
    expect(screen.getByRole("button", { name: "Extract proposals" })).toBe(control); expect(control).toHaveFocus();
  });
  it("hides proposals after a report edit and ignores the older list response", async () => {
    const api = agentGateway(); let deliver!: (tasks: ReturnType<typeof agentTask>[]) => void;
    vi.mocked(api.list).mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; })).mockResolvedValue([]);
    const view = render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    view.rerender(<AgentProposalReview report={savedReport(2)} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    deliver([agentTask()]);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("सामान नहीं आया।", { selector: "blockquote" })).not.toBeInTheDocument();
  });
  it("keeps the same idempotency key after an ambiguous enqueue failure", async () => {
    const user = userEvent.setup(), api = agentGateway(); vi.mocked(api.start).mockRejectedValue(new Error("network"));
    render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    const button = await screen.findByRole("button", { name: "Extract proposals" });
    await waitFor(() => expect(button).toBeEnabled()); await user.click(button); await screen.findByRole("alert");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(vi.mocked(api.start).mock.calls[0][2]).toBe(vi.mocked(api.start).mock.calls[1][2]);
  });
  it("hides the previous report's ready proposals immediately when the report changes", async () => {
    const api = agentGateway(); vi.mocked(api.list).mockResolvedValueOnce([agentTask()]).mockImplementation(() => new Promise(() => undefined));
    const view = render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    await screen.findByText("सामान नहीं आया।", { selector: "blockquote" });
    const other = { ...savedReport(), _id: crypto.randomUUID(), messages: [{ id: crypto.randomUUID(), text: "Other report" }] };
    view.rerender(<AgentProposalReview report={other} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    expect(screen.queryByText("सामान नहीं आया।", { selector: "blockquote" })).not.toBeInTheDocument();
  });
  it("uses a new creation key after canceling an enqueue whose response was lost", async () => {
    const user = userEvent.setup(), api = agentGateway(); vi.mocked(api.start).mockRejectedValueOnce(new Error("network"));
    render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    const control = await screen.findByRole("button", { name: "Extract proposals" }); await waitFor(() => expect(control).toBeEnabled());
    await user.click(control); await screen.findByRole("alert");
    vi.mocked(api.list).mockResolvedValue([agentTask("queued")]); await user.click(screen.getByRole("button", { name: "Reload analysis" }));
    vi.mocked(api.cancel).mockImplementation(async () => { vi.mocked(api.list).mockResolvedValue([agentTask("canceled")]); return agentTask("canceled"); });
    await user.click(await screen.findByRole("button", { name: "Cancel extraction" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledOnce());
    await screen.findByRole("button", { name: "Extract proposals" }); await user.click(control);
    expect(vi.mocked(api.start).mock.calls[0][2]).not.toBe(vi.mocked(api.start).mock.calls[1][2]);
  });
  it("cancels a durable pending task but does not cancel it when the panel unmounts", async () => {
    const user = userEvent.setup(), api = agentGateway(); vi.mocked(api.list).mockResolvedValue([agentTask("queued")]);
    const view = render(<AgentProposalReview report={savedReport()} language="en" api={api} onAccept={async () => true} onExample={async () => true} />);
    await user.click(await screen.findByRole("button", { name: "Cancel extraction" }));
    expect(api.cancel).toHaveBeenCalledWith(savedReport()._id, agentTask().id);
    view.unmount(); expect(api.cancel).toHaveBeenCalledTimes(1);
  });
  it("shows an empty authored-fixture result honestly and supports Hindi", async () => {
    const api = agentGateway(); const empty = agentTask(); empty.result!.proposals = []; vi.mocked(api.list).mockResolvedValue([empty]);
    render(<AgentProposalReview report={savedReport()} language="hi" api={api} onAccept={async () => true} onExample={async () => true} />);
    expect(await screen.findByText(/इस उदाहरण से जोड़ने के लिए कोई नया प्रस्ताव नहीं मिला/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "चुने हुए प्रस्ताव ड्राफ़्ट में जोड़ें" })).not.toBeInTheDocument();
  });
});
