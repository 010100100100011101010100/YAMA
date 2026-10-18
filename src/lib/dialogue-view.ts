import type { Message } from "./demo-state";
import type { Dialogue } from "./dialogue";

export function conversationMessages(base: Message[], dialogue: Dialogue | null, revision: number): Message[] {
  if (!dialogue) return base;
  const entries = [...dialogue.messages];
  const turn = dialogue.turn;
  if (turn?.status === "ready" && turn.reply && turn.revision === revision && !entries.some(entry => entry.id === turn.id))
    entries.push({ id: turn.id, agent: turn.agent, revision: turn.revision, messageId: turn.messageId, text: turn.reply.text, handoff:turn.reply.handoff, adapter: turn.adapter, language: turn.language,
      ...(turn.userPrompt ? { userPrompt: turn.userPrompt } : {}),
      ...(turn.reply.question ? { question: turn.reply.question } : {}), ...(turn.connectionReceipt ? { connectionReceipt: turn.connectionReceipt } : {}),
      ...(turn.publicContext ? { publicContext: turn.publicContext } : {}) });
  const messages: Message[] = [];
  const prompts = new Set<string>();
  for (const message of base) {
    messages.push(message);
    for (const entry of entries.filter(entry => entry.messageId === message.id)) {
      if (entry.userPrompt && !prompts.has(entry.userPrompt.id)) { prompts.add(entry.userPrompt.id); messages.push({ id: entry.userPrompt.id, agent: "you", text: entry.userPrompt.text }); }
      messages.push({ id: entry.id, agent: entry.agent, text: entry.text,
      dialogue: { ...(entry.handoff?{handoff:entry.handoff}:{}),revision: entry.revision, older: entry.revision !== revision, provider: entry.adapter.provider, language: entry.language,
        ...(entry.question ? { question: entry.question } : {}),
        ...(entry.publicContext ? { publicContext: entry.publicContext } : {}),
        ...(entry.connectionReceipt ? { connectionReceipt: entry.connectionReceipt } : {}) } });
    }
    if (turn?.userPrompt && turn.messageId === message.id && !prompts.has(turn.userPrompt.id)) {
      prompts.add(turn.userPrompt.id); messages.push({ id: turn.userPrompt.id, agent: "you", text: turn.userPrompt.text });
    }
  }
  return messages;
}
