"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/atoms/Button";

// BeautifulUI RecommendationCard (MIT), supplied fixed card + alternatives drawer.
// Choosing an option runs an application action; no invented confidence or acceptance.
export type RecommendationOption = { key: string; body: ReactNode; short: string; label: string; cta: string; disabled?: boolean };
export default function RecommendationCard({ options, labels = {}, onConfirm }: {
  options: RecommendationOption[]; labels?: { title?: string; alternatives?: string; otherOptions?: string };
  onConfirm: (key: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const id = useId();
  const active = options[selected];
  if (!active) return null;
  return <div data-beautifului="RecommendationCard" className="w-full max-w-95 overflow-hidden rounded-card bg-surface shadow-card">
    <div className="primitive-card-pad">
      <h3 className="text-[14px] font-medium text-ink">{labels.title ?? "Choose a next step"}</h3>
      <div key={active.key} style={{ animation: "fade-in 180ms ease-out both" }} className="mt-1.5 min-h-12 text-[13px] leading-relaxed text-ink-2">{active.body}</div>
    </div>
    <div id={id} hidden={!open} className="border-t border-line px-2 py-2">
      <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-3">{labels.otherOptions ?? "Other options"}</p>
      {options.map((option, index) => index !== selected && <button key={option.key} type="button" onClick={() => setSelected(index)} className="flex w-full flex-wrap items-center gap-2.5 rounded-control px-1.5 py-1.5 transition-colors duration-100 text-left hover:bg-hover">
        <span className="min-w-0 flex-1 text-[12.5px] text-ink">{option.short}</span><span className="text-[12.5px] text-ink-2">{option.label}</span>
      </button>)}
    </div>
    <div className="primitive-card-footer flex flex-wrap items-center justify-between gap-3 bg-surface">
      <span className="text-[12.5px] text-ink-2">{active.label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {options.length > 1 && <Button size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{labels.alternatives ?? "Alternatives"}</Button>}
        <Button variant="primary" size="sm" disabled={active.disabled} onClick={() => onConfirm(active.key)}>{active.cta}</Button>
      </div>
    </div>
  </div>;
}
