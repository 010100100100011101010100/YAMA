"use client";

import { useId, useState, type ReactNode } from "react";

// BeautifulUI ToolChips (MIT): supplied expandable tool rows and inline chips.
// The caller supplies actual operations; the gallery sequence and code diffs are omitted.
const icons: Record<string, ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  read: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  run: <><path d="M4 17l6-5-6-5M12 19h8" /></>,
};
export type ToolStep = { icon: string; label: string; chip: string; mono?: boolean; detailMono?: boolean; detail: { text: string }[] };
export default function ToolChips({ steps, labels, initiallyOpen = true }: { steps: ToolStep[]; labels: { header: string }; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const id = useId();
  return <div data-beautifului="ToolChips" className="w-full pb-1">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2">
      <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="transition-transform duration-200" style={{ transform: open ? "rotate(0)" : "rotate(-90deg)" }}><path d="M6 9l6 6 6-6" /></svg>{labels.header}
    </button>
    <div id={id} hidden={!open} className="mt-1.5 flex flex-col gap-1">
      {steps.map((row, index) => {
        const rowOpen = openRows.has(row.label);
        return <div key={row.label}>
          <button type="button" aria-label={`${row.label} ${row.chip}`} aria-expanded={rowOpen} aria-controls={`${id}-${index}`} onClick={() => setOpenRows(current => { const next = new Set(current); if (next.has(row.label)) next.delete(row.label); else next.add(row.label); return next; })}
            className="group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-control px-[3px] text-left transition-colors duration-100 hover:bg-hover-2">
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill={row.icon === "think" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-ink-3">{icons[row.icon] ?? icons.run}</svg>
            <span className="text-[12.5px] font-medium text-ink">{row.label}</span>
            <span className={`inline-flex h-5.5 min-w-0 flex-1 items-center truncate rounded-chip bg-field px-1.5 text-[11.5px] text-ink-2 shadow-hairline transition-colors duration-100 hover:bg-hover-2 ${row.mono ? "font-mono" : ""}`}>{row.chip}</span>
            <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3"><path d={rowOpen ? "M6 9l6 6 6-6" : "m9 6 6 6-6 6"} /></svg>
          </button>
          <div id={`${id}-${index}`} hidden={!rowOpen} className="ml-2 border-l border-line py-1 pl-3.5">
            {row.detail.map(line => <p key={line.text} className={`text-[11.5px] leading-[1.6] text-ink-2 ${row.detailMono ? "font-mono" : ""}`}>{line.text}</p>)}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
