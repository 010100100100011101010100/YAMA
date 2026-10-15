"use client";

import { useId, useState } from "react";
import { Button } from "@/components/atoms/Button";

// BeautifulUI StreamingText (MIT), supplied rendering adapted to incoming text.
// No timer replay, blurred words, sample citations, or placeholder action buttons.
export type StreamingSource = { id: string; name: string; description: string };

export default function StreamingText({ text, streaming = false, sources = [], sourcesLabel = "Sources", onSource, onStop, stopLabel = "Stop reply", language }: {
  text: string; streaming?: boolean; sources?: StreamingSource[]; sourcesLabel?: string;
  onSource?: (id: string) => void; onStop?: () => void; stopLabel?: string; language?: string;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourceList = useId();
  return <div data-beautifului="StreamingText" className="w-full">
    <p lang={language} className="whitespace-pre-wrap text-[13px] leading-[1.7] text-ink">{text}{streaming && <span aria-hidden className="stream-caret is-streaming" />}</p>
    {(sources.length > 0 || streaming && onStop) && <div className="mt-2 flex flex-wrap items-center gap-2">
      {streaming && onStop && <Button variant="secondary" size="sm" onClick={onStop}>{stopLabel}</Button>}
      {sources.length > 0 && <button type="button" aria-expanded={sourcesOpen} aria-controls={sourceList} onClick={() => setSourcesOpen(!sourcesOpen)} className="flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-[12px] text-ink-2 hover:bg-hover">{sourcesLabel} <span className="tabular-nums">{sources.length}</span></button>}
    </div>}
    <div id={sourceList} hidden={!sourcesOpen} className="mt-1.5 flex flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
      {sources.map(source => <button key={source.id} type="button" onClick={() => onSource?.(source.id)} className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-left text-[12px] text-ink-2 hover:bg-hover hover:text-ink"><span className="animated-underline">{source.name}</span><span className="ml-auto">{source.description}</span></button>)}
    </div>
  </div>;
}
