import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ChatHistory from "@/components/yama/ChatHistory";
import AgentInfo from "@/components/yama/AgentInfo";
import DialogueStatus from "@/components/yama/DialogueStatus";
import { conversationMessages } from "@/lib/dialogue-view";
import { AGENT_ADAPTER } from "@/lib/agent-task";
import type { Dialogue } from "@/lib/dialogue";
const id = crypto.randomUUID(),
  messageId = crypto.randomUUID();
const queued: Dialogue = {
  reportId: id,
  version: 1,
  activeAgent: "drishti",
  automatic: true,
  language: "en",
  messages: [],
  turn: {
    id: crypto.randomUUID(),
    agent: "drishti",
    revision: 2,
    messageId,
    status: "queued",
    adapter: AGENT_ADAPTER,
    reply: null,
    errorCode: null,
    language: "en",
  },
};
describe("chat finishing controls", () => {
  it("labels unresolved/resolved chat rows and selects a saved chat", async () => {
    const select = vi.fn();
    render(
      <ChatHistory
        chats={[
          {
            _id: id,
            title: "Fictional chat",
            language: "en",
            resolution: "unresolved",
            statusVersion: 0,
          },
          {
            _id: messageId,
            title: "Finished chat",
            language: "hi",
            resolution: "resolved",
            statusVersion: 1,
          },
        ]}
        activeId={id}
        language="en"
        disabled={false}
        loading={false}
        error={false}
        onSelect={select}
        onNew={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Fictional chat.*Unresolved/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("button", { name: /Finished chat.*Resolved/ }),
    ).toHaveAttribute("data-resolution", "resolved");
    await userEvent.click(
      screen.getByRole("button", { name: /Finished chat.*Resolved/ }),
    );
    expect(select).toHaveBeenCalledWith(messageId);
  });
  it("opens agent nature from its info button and restores keyboard focus on Escape", async () => {
    render(<AgentInfo agent="drishti" language="en" />);
    const button = screen.getByRole("button", { name: "About Drishti" });
    await userEvent.click(button);
    expect(
      screen.getByRole("dialog", { name: "About Drishti" }),
    ).toHaveTextContent("Pattern analyst");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
  it("shows actual pending speaker dots and removes them for ready, canceled or stale turns", () => {
    const props = {
      language: "en" as const,
      error: "",
      busy: false,
      onStop: vi.fn(),
      onRetry: vi.fn(),
      revision: 2,
    };
    const view = render(<DialogueStatus {...props} dialogue={queued} />);
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Drishti");
    expect(screen.queryByRole("button", { name: "Ask selected agent" })).not.toBeInTheDocument();
    view.rerender(
      <DialogueStatus
        {...props}
        dialogue={{ ...queued, turn: { ...queued.turn!, status: "running" } }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Drishti is typing");
    expect(screen.queryByRole("button", { name: "Ask selected agent" })).not.toBeInTheDocument();
    view.rerender(
      <DialogueStatus
        {...props}
        dialogue={{ ...queued, turn: { ...queued.turn!, status: "ready" } }}
      />,
    );
    expect(document.querySelector(".typing-dots")).toBeNull();
    view.rerender(<DialogueStatus {...props} revision={3} dialogue={queued} />);
    expect(document.querySelector(".typing-dots")).toBeNull();
  });
  it("preserves a real handoff target through ready and saved message presentation", () => {
    const handoff = {
      target: "disha" as const,
      reason: "next_actions" as const,
    };
    const dialogue = {
      ...queued,
      turn: {
        ...queued.turn!,
        status: "ready" as const,
        reply: { text: "Disha can explain the next steps.", handoff },
      },
    };
    const base = [
      { id: messageId, agent: "you" as const, text: "A fictional question." },
    ];
    expect(
      conversationMessages(base, dialogue, 2)[1].dialogue?.handoff,
    ).toEqual(handoff);
    expect(
      conversationMessages(
        base,
        {
          ...dialogue,
          turn: null,
          messages: [
            {
              id: queued.turn!.id,
              agent: "drishti",
              revision: 2,
              messageId,
              text: "Disha can explain the next steps.",
              handoff,
              adapter: AGENT_ADAPTER,
              language: "en",
            },
          ],
        },
        2,
      )[1].dialogue?.handoff,
    ).toEqual(handoff);
  });
});
