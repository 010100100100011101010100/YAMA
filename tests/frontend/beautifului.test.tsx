import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TaskRows from "@/components/primitives/TaskRows";
import ContextCards from "@/components/primitives/ContextCards";
import PromptBar from "@/components/primitives/PromptBar";
import { getCopy } from "@/lib/copy";

describe("BeautifulUI application adapters", () => {
  it("keeps task status controlled by the application rather than a demo timer", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<TaskRows rows={[{ key: "comparison", label: "Checking the example", status: "running" }]} />);
      vi.advanceTimersByTime(30_000);
      expect(screen.getByRole("status")).toHaveTextContent("Checking the example");
      rerender(<TaskRows rows={[{ key: "comparison", label: "Comparison failed", status: "failed" }]} />);
      vi.advanceTimersByTime(30_000);
      expect(screen.getByRole("status")).toHaveTextContent("Comparison failed");
    } finally { vi.useRealTimers(); }
  });

  it("shows source controls immediately and opens the actual source id", () => {
    const onSource = vi.fn();
    render(<ContextCards header="Sources" sourceLabel="Read source" chunks={[{ id: "message-1", title: "Original message", body: "I am unsure of the date.", source: "Your message" }]} onSource={onSource} />);
    fireEvent.click(screen.getByRole("button", { name: "Read source: Your message" }));
    expect(onSource).toHaveBeenCalledWith("message-1");
    expect(screen.getByText("I am unsure of the date.")).toBeVisible();
  });

  it("does not submit unfinished IME text or clear a controlled draft", () => {
    const onSend = vi.fn();
    render(<PromptBar value="मेरी बात" onChange={vi.fn()} onSend={onSend} onAttach={vi.fn()} error={false} copy={getCopy("hi")} />);
    const input = screen.getByRole("textbox", { name: "आपका संदेश" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledOnce();
    expect(input).toHaveValue("मेरी बात");
  });

  it("returns focus to the composer after clicking Send", () => {
    render(<PromptBar value="My account" onChange={vi.fn()} onSend={vi.fn()} onAttach={vi.fn()} error={false} copy={getCopy("en")} />);
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveFocus();
  });
});
