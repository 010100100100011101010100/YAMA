import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import Storyroom from "@/components/yama/Storyroom";
import type { DialogueApi } from "@/lib/dialogue-api";
import type { Dialogue, DialogueCommand } from "@/lib/dialogue";
import { AGENT_ADAPTER } from "@/lib/agent-task";
import { ReportApiError } from "@/lib/report-api";
import { messageId, reportGateway, reportId, savedReport, confirmedReport, connections } from "./report-fixtures";
import { agentGateway } from "./agent-fixtures";

vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
function gateway(initial?: Dialogue) {
  let state: Dialogue = initial ?? { reportId, version: 0, activeAgent: "saathi", automatic: true, language: "en", messages: [], turn: null };
  const api: DialogueApi = { get: vi.fn(async () => structuredClone(state)), change: vi.fn(async (_id, command) => {
    state = { ...state, version: state.version + 1 };
    if (command.operation === "reply") {
      state = { ...state, activeAgent: command.agent, language: command.language, turn: { id: crypto.randomUUID(), agent: command.agent, messageId, revision: 1, language: command.language,
        status: "ready", adapter: AGENT_ADAPTER, errorCode: null, reply: { text: "Here is the saved Saathi reply. Drishti can explain comparison next.", handoff: command.automatic ? { target: "drishti", reason: "similar_cases" } : null } } };
    } else if (command.operation === "delivered" && state.turn?.reply) {
      const turn = state.turn;
      state.messages = [...state.messages, { id: turn.id, agent: turn.agent, messageId, revision: 1, text: turn.reply!.text, adapter: turn.adapter, language: turn.language }];
      state = { ...state, activeAgent: "drishti", turn: { ...turn, id: crypto.randomUUID(), agent: "drishti", status: "queued", reply: null } };
    } else if (command.operation === "select") state = { ...state, activeAgent: command.agent, turn: state.turn ? { ...state.turn, status: "canceled", reply: null } : null };
    else if (command.operation === "language") state.language = command.language;
    else if (command.operation === "stop") state.turn = state.turn ? { ...state.turn, status: "canceled", reply: null } : null;
    return structuredClone(state);
  }) };
  return { api, current: () => state };
}

describe("saved three-agent chat", () => {
  it("keeps the selector and role info for the chosen recipient while @mention routing takes priority", async () => {
    const user = userEvent.setup(), reports = reportGateway(), dialogue = gateway();
    render(<Storyroom api={reports} agentTasksApi={agentGateway()} conversationsApi={dialogue.api}/>);
    const input = screen.getByRole("textbox", { name: "Your message" });
    await waitFor(() => expect(input).toBeEnabled());
    await user.selectOptions(screen.getByRole("combobox", { name: "Choose an agent" }), "disha");
    await user.click(screen.getByRole("button", { name: "About Disha" }));
    expect(screen.getByText("Practical guide")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close agent info" }));
    fireEvent.change(input, { target: { value: "@Drishti, explain similar cases." } });
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(dialogue.api.change).toHaveBeenCalledWith(reportId, expect.objectContaining({ operation: "reply", agent: "drishti" })));
    expect(reports.create).toHaveBeenCalledWith("@Drishti, explain similar cases.", "en", expect.any(String));
    expect(screen.getByRole("combobox", { name: "Choose an agent" })).toHaveValue("disha");
    expect(screen.getByRole("button", { name: "About Disha" })).toBeInTheDocument();
  });

  it("sends a plain-name request to Saathi before the backend's named handoff", async () => {
    const user = userEvent.setup(), reports = reportGateway(), dialogue = gateway();
    render(<Storyroom api={reports} agentTasksApi={agentGateway()} conversationsApi={dialogue.api}/>);
    const input = screen.getByRole("textbox", { name: "Your message" });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "Disha, help me decide what to do next." } });
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(dialogue.api.change).toHaveBeenCalledWith(reportId, expect.objectContaining({ operation: "reply", agent: "saathi" })));
  });

  it("keeps the source panel open while refreshing a grounded comparison", async () => {
    const user = userEvent.setup(), reports = reportGateway();
    vi.mocked(reports.restore).mockResolvedValue(confirmedReport());
    let finish!: (value: ReturnType<typeof connections>) => void;
    const pending = new Promise<ReturnType<typeof connections>>(resolve => { finish = resolve; });
    vi.mocked(reports.connections).mockResolvedValueOnce(connections()).mockReturnValueOnce(pending);
    const dialogue = gateway({ reportId, version: 1, activeAgent: "drishti", automatic: false, language: "en", turn: null,
      messages: [{ id: crypto.randomUUID(), agent: "drishti", revision: 1, messageId, text: "No matching fictional examples.", adapter: AGENT_ADAPTER, language: "en",
        connectionReceipt: { recipe: "confirmed-pattern-sources-v1", revision: 1, cases: [] } }] });
    render(<Storyroom api={reports} agentTasksApi={agentGateway()} conversationsApi={dialogue.api} />);
    await screen.findByRole("button", { name: "See what matches" });
    await user.click(screen.getByRole("button", { name: "View comparison sources" }));
    const title = screen.getByRole("heading", { name: "What looks similar?" });
    expect(title).toBeInTheDocument();
    await waitFor(() => expect(reports.connections).toHaveBeenCalledTimes(2));
    finish(connections());
    await screen.findByText(/There are no confirmed pattern details/);
    expect(title).toBeInTheDocument(); expect(document.activeElement).toBe(title);
  });
  it("saves narration, displays and acknowledges a reply, then hands off without moving focus", async () => {
    const user = userEvent.setup(), reports = reportGateway(), dialogue = gateway();
    const { container } = render(<Storyroom api={reports} agentTasksApi={agentGateway()} conversationsApi={dialogue.api} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your message" })).toBeEnabled());
    const input = screen.getByRole("textbox", { name: "Your message" });
    await user.click(input); fireEvent.change(input, { target: { value: savedReport().messages[0].text } });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(dialogue.current().activeAgent).toBe("drishti"));
    expect(screen.getByRole("combobox", { name: "Choose an agent" })).toHaveValue("saathi");
    expect(within(screen.getByRole("log")).getByText(/Here is the saved Saathi reply/)).toBeVisible();
    expect(screen.queryByText("Authored demo reply · Revision 1")).not.toBeInTheDocument();
    expect(input).toHaveFocus(); expect(dialogue.current().messages).toHaveLength(1);
    expect(reports.confirm).not.toHaveBeenCalled();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations.map(violation => violation.id)).toEqual([]);
  });
  it("restores dialogue and the active agent without replaying generation", async () => {
    const reports = reportGateway(); vi.mocked(reports.restore).mockResolvedValue(savedReport());
    const dialogue = gateway({ reportId, version: 4, activeAgent: "disha", language: "hi", automatic: false,
      messages: [{ id: crypto.randomUUID(), agent: "disha", language: "hi", revision: 1, messageId, text: "यह सेव किया गया उत्तर है।", adapter: AGENT_ADAPTER }], turn: null });
    render(<Storyroom api={reports} agentTasksApi={agentGateway()} conversationsApi={dialogue.api} />);
    await screen.findByText("यह सेव किया गया उत्तर है।");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "एजेंट चुनें" })).toHaveValue("saathi"));
    expect(dialogue.current().activeAgent).toBe("disha");
    expect(dialogue.api.change).not.toHaveBeenCalled();
  });
  it("stops a queued reply on manual agent selection", async () => {
    const reports = reportGateway(); vi.mocked(reports.restore).mockResolvedValue(savedReport());
    const dialogue = gateway({ reportId, version: 2, activeAgent: "saathi", language: "en", automatic: true, messages: [], turn: {
      id: crypto.randomUUID(), agent: "saathi", language: "en", revision: 1, messageId, status: "queued", adapter: AGENT_ADAPTER, errorCode: null, reply: null } });
    render(<Storyroom api={reports} agentTasksApi={agentGateway()} conversationsApi={dialogue.api} />);
    await screen.findByRole("button", { name: "Stop reply" });
    fireEvent.change(screen.getByRole("combobox", { name: "Choose an agent" }), { target: { value: "disha" } });
    await screen.findByText("Reply stopped.");
    expect(dialogue.current().activeAgent).toBe("disha");
    expect(dialogue.api.change).toHaveBeenCalledWith(reportId, expect.objectContaining({ operation: "select", agent: "disha" }));
  });
  it("keeps a lost reply request's key for an explicit retry", async () => {
    const reports = reportGateway(), dialogue = gateway();
    const requests: DialogueCommand[] = [];
    vi.mocked(dialogue.api.change).mockImplementation(async (_id, command) => {
      requests.push(command);
      if (command.operation === "reply" && requests.filter(request => request.operation === "reply").length === 1) throw new ReportApiError("network_error");
      return { ...dialogue.current(), version: 1 };
    });
    render(<Storyroom api={reports} agentTasksApi={agentGateway()} conversationsApi={dialogue.api} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your message" })).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), { target: { value: savedReport().messages[0].text } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("The reply is unavailable. Your words are saved.");
    fireEvent.click(screen.getByRole("button", { name: "Ask selected agent" }));
    await waitFor(() => expect(requests.filter(request => request.operation === "reply")).toHaveLength(2));
    const replies = requests.filter(request => request.operation === "reply");
    expect(replies[0].key).toBe(replies[1].key);
  });
});
