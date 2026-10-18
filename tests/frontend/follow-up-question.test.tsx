import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FollowUpQuestion from "@/components/yama/FollowUpQuestion";
import { validateReply } from "@/lib/dialogue";

describe("agent follow-up controls", () => {
  it("requires a choice, submits that exact answer and waits for persistence", async () => {
    const user = userEvent.setup(), onAnswer = vi.fn().mockResolvedValue(true);
    render(<FollowUpQuestion language="en" disabled={false} question={{ kind: "choice", prompt: "Was any money returned?", options: ["All of it", "Some of it", "None yet"], placeholder: null }} onAnswer={onAnswer} />);
    expect(screen.getByRole("button", { name: "Send answer" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Some of it" }));
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("Some of it");
    expect(await screen.findByRole("button", { name: "Answer sent" })).toHaveAttribute("aria-disabled", "true");
  });
  it("lets a failed fill-in answer be retried without losing the text", async () => {
    const user = userEvent.setup(), onAnswer = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<FollowUpQuestion language="en" disabled={false} question={{ kind: "text", prompt: "What did the bank tell you?", options: [], placeholder: "Their last update" }} onAnswer={onAnswer} />);
    await user.type(screen.getByRole("textbox"), "The dispute is open.");
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("wasn’t sent");
    expect(screen.getByRole("textbox")).toHaveValue("The dispute is open.");
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(2));
  });
  it("does not submit stale or busy forms and rejects malformed model questions", async () => {
    const user = userEvent.setup(), onAnswer = vi.fn();
    render(<FollowUpQuestion language="hi" disabled question={{ kind: "choice", prompt: "अगला कदम?", options: ["हाँ", "नहीं"], placeholder: null }} onAnswer={onAnswer} />);
    await user.click(screen.getByRole("radio", { name: "हाँ" }));
    expect(onAnswer).not.toHaveBeenCalled();
    const reply = { text: "One question.", handoff: null };
    expect(validateReply({ ...reply, question: { kind: "choice", prompt: "Choose", options: ["Same", "Same"], placeholder: null } }, "saathi", false, 0)).toBeNull();
    expect(validateReply({ ...reply, question: { kind: "text", prompt: "Your update?", options: [], placeholder: null } }, "saathi", false, 0)?.question?.kind).toBe("text");
  });
});
