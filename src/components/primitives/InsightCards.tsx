"use client";

import { useState, type ReactNode } from "react";

// BeautifulUI InsightCards (MIT), supplied carousel/pager and page composition.
// Yama supplies sourced comparisons; the unrelated sales-chart defaults are omitted.
export type InsightPage = { key: string; prose: ReactNode; content: ReactNode; action?: { label: string; onClick: () => void } };
export default function InsightCards({ pages, labels }: { pages: InsightPage[]; labels: { title: string; previous: string; next: string } }) {
  const [page, setPage] = useState(0);
  const active = pages[page];
  if (!active) return null;
  return <section data-beautifului="InsightCards" className="w-full">
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-baseline gap-1.5 text-[13px] font-semibold text-ink">{labels.title}<span className="text-[13px] text-ink-3 tabular-nums">{page + 1} / {pages.length}</span></h3>
      <span className="flex items-center gap-1">{[labels.previous, labels.next].map((label, index) => <button key={label} type="button" aria-label={label} disabled={pages.length < 2} onClick={() => setPage((page + (index === 0 ? pages.length - 1 : 1)) % pages.length)} className="flex size-6 items-center justify-center rounded-[6px] text-ink-2 hover:bg-hover hover:text-ink">
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d={index === 0 ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} /></svg>
      </button>)}</span>
    </div>
    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{active.prose}</p>
    <div className="mt-2 rounded-card bg-surface p-3 shadow-hairline">{active.content}</div>
    {active.action && <button type="button" onClick={active.action.onClick} className="mt-2 rounded-full bg-surface px-3 py-1.5 text-left text-[12px] text-ink shadow-btn hover:bg-hover">{active.action.label}</button>}
  </section>;
}
