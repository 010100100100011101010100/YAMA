import { describe, expect, it, vi } from "vitest";
import { createDialogueApi } from "@/lib/dialogue-api";
import { conversationMessages } from "@/lib/dialogue-view";
import { validateReply, type Dialogue } from "@/lib/dialogue";
import { AGENT_ADAPTER } from "@/lib/agent-task";
import { messageId, reportId } from "./report-fixtures";

export const initialDialogue = (): Dialogue => ({ reportId, version: 0, activeAgent: "saathi", automatic: true, language: "en", messages: [], turn: null });
describe("dialogue boundary and presentation", () => {
  it("rejects self, disabled and excessive handoffs", () => {
    expect(validateReply({ text: "Text", handoff: { target: "saathi", reason: "user_goal" } }, "saathi", true, 0)).toBeNull();
    expect(validateReply({ text: "Text", handoff: { target: "disha", reason: "next_actions" } }, "saathi", false, 0)).toBeNull();
    expect(validateReply({ text: "Text", handoff: { target: "disha", reason: "next_actions" } }, "saathi", true, 2)).toBeNull();
  });
  it("anchors replies after their user message, keeps older revision labels and deduplicates ready delivery", () => {
    const dialogue = initialDialogue(), id = crypto.randomUUID();
    dialogue.messages = [{ id, messageId, agent: "saathi", revision: 1, text: "Saved answer", adapter: AGENT_ADAPTER, language: "hi" }];
    dialogue.turn = { ...dialogue.messages[0], status: "ready", reply: { text: "Saved answer", handoff: null }, errorCode: null };
    const messages = conversationMessages([{ id: "welcome", agent: "saathi", text: "Welcome" }, { id: messageId, agent: "you", text: "Account" }, { id: "later", agent: "you", text: "Correction" }], dialogue, 2);
    expect(messages.map(message => message.id)).toEqual(["welcome", messageId, id, "later"]);
    expect(messages[2].dialogue?.older).toBe(true); expect(messages[2].dialogue?.language).toBe("hi");
  });
  it("keeps a follow-up question in order through handoffs and after a later account correction", () => {
    const dialogue = initialDialogue(), prompt = { id: crypto.randomUUID(), text: "What happened in report two?" };
    const first = { id: crypto.randomUUID(), messageId, agent: "drishti" as const, revision: 1, text: "It remains open.", adapter: AGENT_ADAPTER, language: "en" as const, userPrompt: prompt };
    dialogue.messages = [first, { ...first, id: crypto.randomUUID(), agent: "disha", text: "Here are the next steps." }];
    const base = [{ id: messageId, agent: "you" as const, text: "My account" }, { id: "correction", agent: "you" as const, text: "A correction" }];
    const messages = conversationMessages(base, dialogue, 2);
    expect(messages.map(message => message.text)).toEqual(["My account", prompt.text, "It remains open.", "Here are the next steps.", "A correction"]);
    expect(messages.filter(message => message.id === prompt.id)).toHaveLength(1);
  });
  it("preserves the Codex session provider for actual generated conversation replies", () => {
    const dialogue = initialDialogue();
    dialogue.messages = [{ id: crypto.randomUUID(), messageId, agent: "drishti", revision: 1, text: "Here are the related records.",
      adapter: { provider: "codex", model: "codex-session", version: "1", live: true }, language: "en" }];
    const messages = conversationMessages([{ id: messageId, agent: "you", text: "Find related records." }], dialogue, 1);
    expect(messages[1].dialogue?.provider).toBe("codex");
  });
  it("uses same-origin, no-store reads and rejects another report's dialogue", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ dialogue: initialDialogue() })));
    const api = createDialogueApi(); await api.get(reportId, new AbortController().signal);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ dialogue: { ...initialDialogue(), reportId: crypto.randomUUID() } })));
    await expect(api.get(reportId, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_response" });
    fetcher.mockRestore();
  });
  it("propagates sanitized server failures and validates mutation responses", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "conversation_conflict" } }), { status: 409 }));
    await expect(createDialogueApi().change(reportId, { operation: "stop", expectedRevision: 1, expectedVersion: 0 })).rejects.toMatchObject({ code: "conversation_conflict" });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ dialogue: { ...initialDialogue(), ownerId: "private" } })));
    await expect(createDialogueApi().get(reportId, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_response" });
    fetcher.mockRestore();
  });
});
