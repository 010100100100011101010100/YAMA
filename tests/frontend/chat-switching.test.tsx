import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Storyroom from "@/components/yama/Storyroom";
import { reportGateway, savedReport } from "./report-fixtures";
import { agentGateway } from "./agent-fixtures";
import { AGENT_ADAPTER } from "@/lib/agent-task";
import type { DialogueApi } from "@/lib/dialogue-api";
import type { Dialogue, DialogueCommand } from "@/lib/dialogue";
function report(text: string) {
  const saved = savedReport(),
    id = crypto.randomUUID(),
    messageId = crypto.randomUUID();
  return {
    ...saved,
    _id: id,
    messages: [{ id: messageId, text }],
    assertions: [
      {
        ...saved.assertions[0],
        value: text,
        originalValue: text,
        source: { messageId, start: 0, end: text.length },
      },
    ],
  };
}
describe("shared saved-chat navigation", () => {
  it("keeps drafts with their own chats and starts a separate new report", async () => {
    const user = userEvent.setup(),
      api = reportGateway(),
      first = report("First fictional narration."),
      second = report("Second fictional narration."),
      created = report("New fictional narration.");
    vi.mocked(api.restore).mockResolvedValue(first);
    vi.mocked(api.get).mockImplementation(async (id) =>
      id === first._id ? first : second,
    );
    vi.mocked(api.create).mockResolvedValue(created);
    api.list = vi.fn(async () =>
      [first, second].map((saved, index) => ({
        _id: saved._id,
        title: index === 0 ? "First fictional chat" : "Second fictional chat",
        language: "en" as const,
        resolution: "unresolved" as const,
        statusVersion: 0,
      })),
    );
    api.chatStatus = vi.fn(async (id: string) => ({
      reportId: id,
      resolution: "unresolved" as const,
      version: 0,
    }));
    const initial = (id: string): Dialogue => ({
      reportId: id,
      version: 0,
      activeAgent: "saathi",
      automatic: false,
      language: "en",
      turn: null,
      messages: [],
    });
    const dialogue: DialogueApi = {
      get: vi.fn(async (id) => initial(id)),
      change: vi.fn(
        async (id: string, command: DialogueCommand): Promise<Dialogue> => ({
          ...initial(id),
          version: 1,
          turn:
            command.operation === "reply"
              ? {
                  id: crypto.randomUUID(),
                  agent: "saathi",
                  revision: 1,
                  messageId: created.messages[0].id,
                  status: "queued",
                  reply: null,
                  errorCode: null,
                  adapter: AGENT_ADAPTER,
                  language: "en",
                }
              : null,
        }),
      ),
    };
    render(
      <Storyroom
        api={api}
        conversationsApi={dialogue}
        agentTasksApi={agentGateway()}
      />,
    );
    await screen.findByText("First fictional narration.");
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "Unsent draft for first." },
    });
    await user.click(
      await screen.findByRole("button", {
        name: /Second fictional chat.*Unresolved/,
      }),
    );
    await screen.findByText("Second fictional narration.");
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue(
      "",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "Unsent draft for second." },
    });
    await user.click(
      await screen.findByRole("button", {
        name: /First fictional chat.*Unresolved/,
      }),
    );
    await screen.findByText("First fictional narration.");
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue(
      "Unsent draft for first.",
    );
    await user.click(screen.getByRole("button", { name: "New chat" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your message" })).toBeEnabled());
    expect(
      within(screen.getByRole("log")).queryByText("First fictional narration."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue(
      "",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "New fictional narration." },
    });
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.revise).not.toHaveBeenCalled();
  }, 15000);
});
