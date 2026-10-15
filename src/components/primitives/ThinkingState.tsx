"use client";

import { useId, useState, type ReactNode } from "react";

// BeautifulUI ThinkingState (MIT): expandable trace rendering from the supplied source.
// Rows describe disclosed operations, not private model reasoning. Work is controlled.
export type ThinkingRow = { primary: string; secondary?: string; status?: "running" | "done" };

export default function ThinkingState({ working, active, done, rows, icon }: {
  working: boolean; active: string; done: string; rows: ThinkingRow[]; icon?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div data-beautifului="ThinkingState" className="flex w-full flex-col">
    <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}
      className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors duration-150 hover:bg-hover-2">
      {icon ?? <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="var(--ink-2)"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>}
      <span className={`text-[13px] font-medium ${working ? "bg-clip-text text-transparent" : "text-ink-2"}`} style={working ? { backgroundImage: "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)", backgroundSize: "200% 100%", animation: "shimmer-text 1.4s linear infinite" } : undefined}>{working ? active : done}</span>
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.2" className="shrink-0 transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <div id={id} hidden={!expanded} className="relative mt-1 ml-[5px] border-l border-line pl-4">
      <div className="flex flex-col gap-1 py-1">
        {rows.map(row => <div key={row.primary} className="flex min-h-7 items-start gap-2 rounded-[6px] px-1.5 py-0.5">
          {row.status === "running" ? <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2" style={{ animation: "spin 700ms linear infinite" }} />
            : row.status === "done" ? <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" className="mt-1 shrink-0"><path d="M20 6L9 17l-5-5" /></svg> : <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-line-strong" />}
          <span className="min-w-0 text-[12.5px] leading-relaxed text-ink">{row.primary}{row.secondary && <span className="block text-ink-2">{row.secondary}</span>}</span>
        </div>)}
      </div>
    </div>
  </div>;
}
