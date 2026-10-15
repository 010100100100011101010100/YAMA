"use client";

import type { ReactNode } from "react";

// BeautifulUI ChatComposer / Section (MIT), adapted from the official registry.
// The application supplies messages, tabs and composer. Gallery reply timers,
// resolving blur and placeholder actions are omitted so state remains truthful.
// Source snapshots: docs/design/beautifului-supplied/ChatComposer.tsx.txt and
// docs/design/beautifului-2026-10-08/chat-composer-ChatComposer.tsx.txt.
export default function ChatComposer({ title, tabs, selectedTab, onTabChange, children, className = "" }: {
  title: string;
  tabs: { id: string; label: string; icon: ReactNode }[];
  selectedTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return <section data-beautifului="ChatComposer" className={`chat-workspace flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[14px] bg-surface shadow-card ${className}`} aria-label={title}>
    <header className="chat-header flex shrink-0 items-center justify-between border-b border-line">
      <h1>{title}</h1>
      <div className="flex items-center mode-switch">
        {tabs.map(item => <button key={item.id} type="button" aria-pressed={selectedTab === item.id}
          onClick={() => onTabChange(item.id)}
          className={`rounded-[6px] px-2 py-[3px] text-[13px] text-ink transition-[background-color,opacity] duration-100 ${selectedTab === item.id ? "bg-field" : "opacity-50 hover:opacity-75"}`}>
          {item.icon}{item.label}
        </button>)}
      </div>
    </header>
    {children}
  </section>;
}

export function ChatMessageView({ id, label, role, body, avatar, fromUser, language }: {
  id: string; label: string; role?: string; body: ReactNode; avatar?: ReactNode;
  fromUser: boolean; language?: string;
}) {
  return <article id={id} className={`message ${fromUser ? "user-message flex justify-end" : "agent-message flex w-full flex-col gap-1.5"}`}>
    <div className={`message-content ${fromUser ? "rounded-xl bg-field px-3 py-1.5 text-[13px] leading-[1.4] text-ink" : ""}`}>
      <header className="flex items-center gap-1 text-[12px] leading-[1.3]">
        {avatar}<strong className="font-medium text-ink">{label}</strong>
        {role && <span className="message-role text-ink-2">{role}</span>}
      </header>
      <div className="message-body text-[13px] leading-normal text-ink" lang={language}>{body}</div>
    </div>
  </article>;
}
