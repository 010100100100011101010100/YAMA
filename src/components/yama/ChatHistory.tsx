"use client";
import { Plus, MessageCircle } from "lucide-react";
import GlideMenu from "@/components/primitives/GlideMenu";
import { Button } from "@/components/atoms/Button";
import { chatText } from "@/lib/chat-copy";
import type { ChatSummary } from "@/lib/chat";
import type { Language } from "@/lib/demo-state";
export default function ChatHistory({
  chats,
  activeId,
  language,
  disabled,
  loading,
  error,
  onSelect,
  onNew,
  onRetry,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  language: Language;
  disabled: boolean;
  loading: boolean;
  error: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  const copy = chatText(language);
  return (
    <div className="chat-history">
      <Button
        aria-label={copy.newChat}
        className="new-chat-button"
        data-sidebar-dismiss
        variant="secondary"
        onClick={onNew}
        disabled={disabled}
      >
        <Plus size={18} />
        <span className="sidebar-copy">{copy.newChat}</span>
      </Button>
      <h2 className="chat-history-heading sidebar-copy">{copy.recent}</h2>
      {loading && (
        <p className="chat-history-note sidebar-copy" role="status">
          {copy.loading}
        </p>
      )}
      {error && (
        <div className="chat-history-note sidebar-copy">
          <p role="alert">{copy.failed}</p>
          <Button variant="quiet" size="sm" onClick={onRetry}>
            {copy.retry}
          </Button>
        </div>
      )}
      <nav aria-label={copy.chats}>
        <GlideMenu
          rowSelector="[data-row]"
          highlightClassName="sidebar-glide-highlight inset-x-0 rounded-[7px] bg-hover"
          className="flex flex-col gap-1"
        >
          {chats.map((chat) => (
            <button
              key={chat._id}
              type="button"
              data-row
              data-sidebar-dismiss
              data-resolution={chat.resolution}
              className="chat-history-row"
              aria-current={activeId === chat._id ? "page" : undefined}
              aria-label={`${chat.title} · ${copy[chat.resolution]}`}
              disabled={disabled}
              onClick={() => onSelect(chat._id)}
            >
              <MessageCircle size={17} aria-hidden="true" />
              <span className="chat-history-copy sidebar-copy">
                <span className="chat-history-title" dir="auto">
                  {chat.title}
                </span>
                <span className="chat-history-status">
                  <span className="chat-status-dot" aria-hidden="true" />
                  {copy[chat.resolution]}
                </span>
              </span>
            </button>
          ))}
        </GlideMenu>
      </nav>
    </div>
  );
}
