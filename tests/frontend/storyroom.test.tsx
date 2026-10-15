import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Storyroom from "@/components/yama/Storyroom";
import { runDemoComparison } from "@/lib/demo-adapter";
import axe from "axe-core";

vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
vi.mock("@/lib/demo-adapter", () => ({ runDemoComparison: vi.fn(async (_signal: AbortSignal, fail: boolean) => fail ? "failed" : "ready") }));

beforeEach(() => vi.clearAllMocks());

async function confirmedExample() {
  const user = userEvent.setup();
  render(<Storyroom persisted={false} />);
  await user.click(screen.getByRole("button", { name: "Try an example" }));
  await user.click(screen.getByRole("button", { name: "Check my notes" }));
  await user.click(screen.getByRole("checkbox", { name: "These details match what I want to say." }));
  await user.click(screen.getByRole("button", { name: "Confirm my notes" }));
  return user;
}

describe("critical frontend flow", () => {
  it("has no automated semantic accessibility violations across the critical screens", async () => {
    const user = userEvent.setup(); const { container } = render(<Storyroom persisted={false} />);
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    // jsdom cannot calculate rendered contrast; that is checked in the real browser.
    const audit = async () => expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations.map(item => item.id)).toEqual([]);
    await audit();
    await user.click(screen.getByRole("button", { name: "Try an example" }));
    await user.click(screen.getByRole("button", { name: "Check my notes" }));
    await audit();
    await user.click(screen.getByRole("checkbox", { name: "These details match what I want to say." }));
    await user.click(screen.getByRole("button", { name: "Confirm my notes" }));
    await user.click(screen.getByRole("button", { name: "Find similar examples" }));
    await user.click(await screen.findByRole("button", { name: "See what matches" }));
    await audit();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next steps" }));
    await audit();
    canvas.mockRestore();
  }, 15000);
  it("keeps a failed message draft and permits retry without duplication", async () => {
    const user = userEvent.setup(); render(<Storyroom persisted={false} />);
    await user.click(screen.getByRole("button", { name: "Options" }));
    await user.click(screen.getByText("Try demo states"));
    await user.click(screen.getByRole("checkbox", { name: "Fail the next demo message" }));
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Payment ka record hai.");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("Payment ka record hai.");
    expect(screen.getByRole("alert")).toHaveTextContent("Your text is still here");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("");
    expect(within(screen.getByRole("log")).getAllByText("Payment ka record hai.")).toHaveLength(1);
  });

  it("does not send on a composing Enter or Shift + Enter", () => {
    render(<Storyroom persisted={false} />);
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.change(input, { target: { value: "अभी लिख रहा हूँ" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(within(screen.getByRole("log")).queryByText("अभी लिख रहा हूँ")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(screen.getByRole("log")).getByText("अभी लिख रहा हूँ")).toBeInTheDocument();
  });

  it("corrects a proposal, restores focus, confirms, hands off, and explains limits", async () => {
    const user = userEvent.setup(); render(<Storyroom persisted={false} />);
    await user.click(screen.getByRole("button", { name: "Try an example" }));
    await user.click(screen.getByRole("button", { name: "Check my notes" }));
    await user.click(screen.getByRole("button", { name: "Edit Amount" }));
    const amount = screen.getByRole("textbox", { name: "Amount" });
    await user.clear(amount); await user.type(amount, "₹8,000");
    await user.click(screen.getByRole("button", { name: "Save Amount" }));
    expect(screen.getByRole("button", { name: "Edit Amount" })).toHaveFocus();
    expect(screen.getByText("Corrected by you")).toBeInTheDocument();
    expect(screen.queryByText(/Check the amount:/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/I paid ₹8,000 for a used phone/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("checkbox", { name: "These details match what I want to say." }));
    await user.click(screen.getByRole("button", { name: "Confirm my notes" }));
    await user.click(screen.getByRole("button", { name: "Find similar examples" }));
    expect(within(screen.getByRole("log")).getByText("Disha", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose an agent" })).toHaveValue("saathi");
    await user.click(await screen.findByRole("button", { name: "See what matches" }));
    expect(within(screen.getByRole("log")).getByText("Drishti", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose an agent" })).toHaveValue("saathi");
    expect(screen.getByText("No evidence it’s the same person")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What differs" })).toBeInTheDocument();
    expect(runDemoComparison).toHaveBeenCalledOnce();
  });

  it("offers a working retry after a failed comparison", async () => {
    const user = await confirmedExample();
    await user.click(screen.getByRole("button", { name: "Options" }));
    await user.click(screen.getByText("Try demo states"));
    await user.click(screen.getByRole("checkbox", { name: "Fail the next demo comparison" }));
    await user.click(screen.getByRole("button", { name: "Your notes" }));
    await user.click(screen.getByRole("button", { name: "Find similar examples" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "See what matches" })).toBeInTheDocument();
    expect(runDemoComparison).toHaveBeenCalledTimes(2);
  });

  it("downloads the latest draft with correction provenance", async () => {
    const user = await confirmedExample();
    await user.click(screen.getByRole("button", { name: "Edit Amount" }));
    await user.clear(screen.getByRole("textbox", { name: "Amount" }));
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "₹8,000");
    await user.click(screen.getByRole("button", { name: "Save Amount" }));
    await user.click(screen.getByRole("button", { name: "Next steps" }));
    const create = vi.fn((blob: Blob) => { expect(blob.type).toBe("text/plain;charset=utf-8"); return "blob:demo-report"; });
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^yama-demo-report-r\d+\.txt$/);
      expect(this.isConnected).toBe(true);
    });
    await user.click(screen.getByRole("button", { name: "Download demo report" }));
    const blob = create.mock.calls[0][0] as Blob;
    const contents = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(contents).toContain("amount: ₹8,000");
    expect(contents).toContain("Draft — not confirmed");
    expect(contents).not.toContain("₹18,000");
    expect(contents).toContain("Source: example-story (user corrected)");
    expect(click).toHaveBeenCalledOnce(); click.mockRestore();
  });

  it("keeps keyboard focus on completion and ignores canceled work", async () => {
    let finish!: (outcome: "ready" | "failed") => void;
    vi.mocked(runDemoComparison).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const user = await confirmedExample();
    await user.click(screen.getByRole("button", { name: "Find similar examples" }));
    expect(screen.getByRole("button", { name: "Check my notes" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Options" }));
    const automatic = screen.getByRole("checkbox", { name: "Allow agent handoffs" });
    await user.click(automatic);
    await act(async () => finish("ready"));
    expect(automatic).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Choose an agent" })).toHaveValue("saathi");
    vi.mocked(runDemoComparison).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "Your notes" }));
    await user.click(screen.getByRole("button", { name: "Find similar examples" }));
    await user.click(screen.getByRole("button", { name: "Stop comparison" }));
    await act(async () => finish("ready"));
    expect(screen.queryByRole("button", { name: "See what matches" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("rejects unsupported evidence and labels accepted files as local", async () => {
    const user = userEvent.setup({ applyAccept: false }); render(<Storyroom persisted={false} />);
    const input = screen.getByLabelText("Choose a file", { selector: "input" });
    await user.upload(input, new File(["<svg/>"], "untrusted.svg", { type: "image/svg+xml" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This file was not added");
    await user.upload(input, new File(["fictional notes"], "notes.txt", { type: "text/plain" }));
    expect(screen.getByText("Selected locally · not uploaded")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove notes.txt" }));
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });

  it("changes language without translating original words or clearing a draft", async () => {
    const user = userEvent.setup(); render(<Storyroom persisted={false} />);
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Seller ne reply nahi kiya.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "hi");
    expect(screen.getByRole("textbox", { name: "आपका संदेश" })).toHaveValue("Seller ne reply nahi kiya.");
    await user.click(screen.getByRole("button", { name: "संदेश भेजें" }));
    expect(within(screen.getByRole("log")).getByText("Seller ne reply nahi kiya.")).toBeInTheDocument();
  });

  it("interrupts a caption-only preview and preserves the shared conversation", async () => {
    const user = userEvent.setup(); render(<Storyroom persisted={false} />);
    await user.click(screen.getByRole("button", { name: "Try an example" }));
    await user.click(screen.getByRole("button", { name: "Voice" }));
    await user.click(screen.getByRole("button", { name: "Start preview" }));
    await user.click(screen.getByRole("button", { name: "Stop preview" }));
    expect(screen.getByText("Preview stopped. Your conversation is still here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start preview" })).toHaveFocus();
    await user.selectOptions(screen.getByRole("combobox", { name: "Choose an agent" }), "drishti");
    expect(within(screen.getByRole("log")).getByText(/I paid ₹8,000/)).toBeInTheDocument();
    expect(screen.getByText("Voice isn’t connected. Caption preview only; your microphone is off.")).toBeInTheDocument();
  });
});
