import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Storyroom from "@/components/yama/Storyroom";
import SidePanel from "@/components/yama/SidePanel";
import Conversation from "@/components/yama/Conversation";
import { getSavedCopy } from "@/lib/persistence-copy";
import { connections, reportId } from "./report-fixtures";

vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));

describe("conversation layout", () => {
  it("starts in chat with agent selection in the composer and no participant panel", () => {
    const { container } = render(<Storyroom persisted={false} />);
    expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".group-participants, .participants")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/Use fictional details|Fictional details only/)).not.toBeInTheDocument();
    const selector = screen.getByRole("combobox", { name: "Choose an agent" });
    for (const name of ["Saathi", "Drishti", "Disha"]) expect(within(selector).getByRole("option", { name })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Your journey" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your message" })).toBeInTheDocument();
  });

  it("opens notes beside the chat, closes with Escape, and keeps the draft", async () => {
    const user = userEvent.setup(); render(<Storyroom persisted={false} />);
    const message = screen.getByRole("textbox", { name: "Your message" });
    await user.type(message, "I want to explain this in my own words.");
    const notes = screen.getByRole("button", { name: "Your notes" });
    await user.click(notes);
    const panel = screen.getByRole("dialog", { name: "Check your notes" });
    expect(within(panel).getByText("Send a message or try the example first." )).toBeInTheDocument();
    expect(message).toHaveValue("I want to explain this in my own words.");
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(notes).toHaveFocus();
    expect(message).toHaveValue("I want to explain this in my own words.");
  });

  it("opens settings from the mobile drawer and restores a visible navigation trigger when closed", async () => {
    const media = window.matchMedia("(max-width: 1040px)");
    const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue({ ...media, matches: true });
    try {
      const user = userEvent.setup();
      render(<Storyroom persisted={false} />);
      await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
      await user.click(screen.getByRole("button", { name: "Options" }));
      const panel = screen.getByRole("dialog", { name: "Conversation options" });
      expect(screen.queryByRole("dialog", { name: "Chats" })).not.toBeInTheDocument();
      fireEvent.keyDown(panel, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveFocus();
    } finally { matchMedia.mockRestore(); }
  });

  it("switches to a conference layout while preserving the shared log and draft", async () => {
    const user = userEvent.setup(); const { container } = render(<Storyroom persisted={false} />);
    const log = screen.getByRole("log");
    const message = screen.getByRole("textbox", { name: "Your message" });
    await user.type(message, "Keep this draft.");
    await user.click(screen.getByRole("button", { name: "Voice" }));
    expect(container.querySelector(".voice-preview")).toBeInTheDocument();
    expect(screen.getByText("Voice isn’t connected. Caption preview only; your microphone is off.")).toBeInTheDocument();
    expect(screen.getByRole("log")).toBe(log);
    expect(message).toHaveValue("Keep this draft.");
    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(container.querySelector(".voice-preview")).not.toBeInTheDocument();
    expect(screen.getByRole("log")).toBe(log);
  });

  it("follows layout changes at the end and preserves position when reading earlier messages", () => {
    let onResize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { onResize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    try {
      const { unmount } = render(<Storyroom persisted={false} />);
      const log = screen.getByRole("log");
      Object.defineProperties(log, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 400 } });
      act(() => onResize());
      expect(log.scrollTop).toBe(1000);
      log.scrollTop = 100;
      fireEvent.scroll(log);
      act(() => onResize());
      expect(log.scrollTop).toBe(100);
      unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("preserves the reader’s position when they explore a reply’s sources", async () => {
    let onResize = () => {};
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { onResize = callback; } observe() {} disconnect() {} });
    try {
      render(<Conversation language="en" copy={getSavedCopy("en")} speakingAgent={null} reportId={reportId} loadReports={async () => connections()}
        messages={[{ id: "comparison", agent: "drishti", text: "Four matching reports.", dialogue: { revision: 1, older: false, provider: "fixture", language: "en",
          connectionReceipt: { recipe: "confirmed-pattern-sources-v1", revision: 1, cases: [{ id: "case-1", version: "a".repeat(64) }] } } }]} />);
      const log = screen.getByRole("log");
      Object.defineProperties(log, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 400 } });
      log.scrollTop = 600;
      await userEvent.setup().click(screen.getByRole("button", { name: "Related reports · 1" }));
      act(() => onResize());
      expect(log.scrollTop).toBe(600);
    } finally { vi.unstubAllGlobals(); }
  });

  it("keeps expandable work and its actions in the conversation scroll region", async () => {
    const user = userEvent.setup();
    render(<Storyroom persisted={false} />);
    await user.click(screen.getByRole("button", { name: "Try an example" }));
    await user.click(screen.getByRole("button", { name: "Check my notes" }));
    await user.click(screen.getByRole("checkbox", { name: "These details match what I want to say." }));
    await user.click(screen.getByRole("button", { name: "Confirm my notes" }));
    await user.click(screen.getByRole("button", { name: "Find similar examples" }));
    const log = screen.getByRole("log");
    expect(within(log).getByRole("button", { name: "Stop comparison" })).toBeInTheDocument();
    await user.click(within(log).getByRole("button", { name: "Checking the example" }));
    expect(within(log).getByText("You’re confirming your own account. This doesn’t independently verify what happened.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Your message" }).closest('[role="log"]')).toBeNull();
  });

  it("starts a different supporting panel at the top and preserves position for updates within it", () => {
    const props = { open: true, title: "Review", closeLabel: "Close", onClose: vi.fn() };
    const { container, rerender } = render(<SidePanel {...props} panelId="review">Notes</SidePanel>);
    const content = container.querySelector(".panel-content") as HTMLDivElement;
    content.scrollTop = 250;
    rerender(<SidePanel {...props} panelId="review">Updated notes</SidePanel>);
    expect(content.scrollTop).toBe(250);
    rerender(<SidePanel {...props} title="Next steps" panelId="steps">Actions</SidePanel>);
    expect(content.scrollTop).toBe(0);
    expect(screen.getByRole("heading", { name: "Next steps" })).toHaveFocus();
  });
});
