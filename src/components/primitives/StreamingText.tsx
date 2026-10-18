"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/atoms/Button";

// BeautifulUI StreamingText (MIT), supplied rendering adapted to incoming text.
// The supplied word reveal runs once for a newly validated reply. History never loops.
export type StreamingSource = { id: string; name: string; description: string };

export default function StreamingText({ text, streaming = false, sources = [], sourcesLabel = "Sources", onSource, onStop, stopLabel = "Stop reply", language, renderText, reveal = false, onDone, showAllLabel = "Show full reply" }: {
  text: string; streaming?: boolean; sources?: StreamingSource[]; sourcesLabel?: string;
  onSource?: (id: string) => void; onStop?: () => void; stopLabel?: string; language?: string;
  renderText?: (text: string) => ReactNode;
  reveal?: boolean; onDone?: () => void; showAllLabel?: string;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const tokens = useMemo(() => text.match(/\S+\s*|\s+/gu) ?? [], [text]);
  const [count, setCount] = useState(0), [showAll, setShowAll] = useState(false);
  const reduced = useReducedMotion(), completed = useRef(false), doneCallback = useRef(onDone);
  useEffect(() => { doneCallback.current = onDone; }, [onDone]);
  const revealing = reveal && !reduced && !showAll && count < tokens.length;
  useEffect(() => {
    if (!revealing) {
      if (!completed.current && doneCallback.current) { completed.current = true; doneCallback.current(); }
      return;
    }
    const timer = setTimeout(() => setCount(value => Math.min(tokens.length, value + Math.max(1, Math.ceil(tokens.length / 110)))), 55);
    return () => clearTimeout(timer);
  }, [count, revealing, tokens.length]);
  const visible = revealing ? tokens.slice(0, count).join("") : text;
  const sourceList = useId();
  return <div data-beautifului="StreamingText" className="w-full">
    <div lang={language} className="streaming-text-body whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{renderText ? renderText(visible) : visible}{(streaming || revealing) && <span aria-hidden className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink stream-caret is-streaming" />}</div>
    {revealing && <button type="button" onClick={() => setShowAll(true)} className="mt-2 rounded-[6px] px-1 py-0.5 text-[12px] text-ink-2 hover:bg-hover">{showAllLabel}</button>}
    {(sources.length > 0 || streaming && onStop) && <div className="mt-2 flex flex-wrap items-center gap-2">
      {streaming && onStop && <Button variant="secondary" size="sm" onClick={onStop}>{stopLabel}</Button>}
      {sources.length > 0 && <button type="button" aria-expanded={sourcesOpen} aria-controls={sourceList} onClick={() => setSourcesOpen(!sourcesOpen)} className="flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-[12px] text-ink-2 hover:bg-hover">{sourcesLabel} <span className="tabular-nums">{sources.length}</span></button>}
    </div>}
    <div id={sourceList} hidden={!sourcesOpen} className="mt-1.5 flex flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
      {sources.map(source => <button key={source.id} type="button" onClick={() => onSource?.(source.id)} className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-left text-[12px] text-ink-2 hover:bg-hover hover:text-ink"><span className="animated-underline">{source.name}</span><span className="ml-auto">{source.description}</span></button>)}
    </div>
  </div>;
}
