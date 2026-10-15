import type { Message } from "./demo-state";
import type { Dialogue } from "./dialogue";

export function conversationMessages(base: Message[], dialogue: Dialogue | null, revision: number): Message[] {
  if (!dialogue) return base;
  const entries = [...dialogue.messages];
  const turn = dialogue.turn;
  if (turn?.status === "ready" && turn.reply && turn.revision === revision && !entries.some(entry => entry.id === turn.id))
    entries.push({ id: turn.id, agent: turn.agent, revision: turn.revision, messageId: turn.messageId, text: turn.reply.text, handoff:turn.reply.handoff, adapter: turn.adapter, language: turn.language,
      ...(turn.connectionReceipt ? { connectionReceipt: turn.connectionReceipt } : {}) });
  const messages: Message[] = [];
  for (const message of base) {
    messages.push(message);
    for (const entry of entries.filter(entry => entry.messageId === message.id)) messages.push({ id: entry.id, agent: entry.agent, text: entry.text,
      dialogue: { ...(entry.handoff?{handoff:entry.handoff}:{}),revision: entry.revision, older: entry.revision !== revision, provider: entry.adapter.provider, language: entry.language,
        ...(entry.connectionReceipt ? { connectionReceipt: entry.connectionReceipt } : {}) } });
  }
  return messages;
}
