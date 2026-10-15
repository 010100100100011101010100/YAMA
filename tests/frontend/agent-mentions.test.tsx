import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import PromptBar from "@/components/primitives/PromptBar";
import { getCopy } from "@/lib/copy";

function Composer({ initial = "", onSend = vi.fn(), onAttach = vi.fn() }) {
  const [text, setText] = useState(initial);
  return <PromptBar value={text} onChange={setText} onSend={onSend} onAttach={onAttach} error={false} copy={getCopy("en")}
    mentionActions={[
      { key: "saathi", name: "@Saathi", description: "Patient listener", insertText: "@Saathi " },
      { key: "drishti", name: "@Drishti", description: "Pattern analyst", insertText: "@Drishti " },
      { key: "disha", name: "@Disha", description: "Practical guide", insertText: "@Disha " },
    ]}
    sourceActions={[{ key: "files", name: "Files", description: "Add evidence", onPick: onAttach }]}/>;
}

describe("agent mention composer", () => {
  it("filters agent mentions and inserts a handle with the keyboard without sending", async () => {
    const user = userEvent.setup(), send = vi.fn();
    render(<Composer onSend={send}/>);
    const input = screen.getByRole("textbox", { name: "Your message" });
    await user.type(input, "Please @d");
    expect(screen.getByRole("listbox", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Files/ })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Please @Disha ");
    expect(input).toHaveFocus();
    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("completes a mention at the caret without deleting the rest of a message", () => {
    render(<Composer initial="Please @dr help with this."/>);
    const input = screen.getByRole("textbox", { name: "Your message" }) as HTMLTextAreaElement;
    input.focus(); input.setSelectionRange(10, 10); fireEvent.select(input);
    fireEvent.click(screen.getByRole("option", { name: "@Drishti Pattern analyst" }));
    expect(input).toHaveValue("Please @Drishti help with this.");
    expect(input.selectionStart).toBe(15);
    expect(input).toHaveFocus();
  });

  it("does not choose an agent during IME composition and preserves a dismissed draft", () => {
    const send = vi.fn();
    render(<Composer initial="@dr" onSend={send}/>);
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(input).toHaveValue("@dr");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the plus menu dedicated to evidence instead of agent mentions", async () => {
    const user = userEvent.setup(), attach = vi.fn();
    render(<Composer onAttach={attach}/>);
    await user.click(screen.getByRole("button", { name: "Choose a file" }));
    await user.click(screen.getByRole("button", { name: "Files Add evidence" }));
    expect(attach).toHaveBeenCalledOnce();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("exposes the active mention to assistive technology with a valid listbox", async () => {
    render(<Composer initial="@"/>);
    const input = screen.getByRole("textbox", { name: "Your message" });
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0].id);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map(violation => violation.id)).toEqual([]);
  });
});
