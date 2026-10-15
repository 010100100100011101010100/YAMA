"use client";

// BeautifulUI ContextCards (MIT), adapted from the official registry.
// Kept the card bar, inset source chip and surface grammar. Sources are shown
// immediately as real buttons; counts come from the supplied source records.
// Upstream source: docs/design/beautifului-2026-10-08/context-cards-ContextCards.tsx.txt
export type ContextChunk = { id: string; title: string; body: string; source: string };

export default function ContextCards({ chunks, header, sourceLabel, onSource }: {
  chunks: ContextChunk[]; header: string; sourceLabel: string; onSource: (id: string) => void;
}) {
  return <section className="context-cards flex w-full flex-col gap-2" aria-label={header}>
    <header className="flex items-center gap-2 px-0.5"><h3 className="text-[13px] font-semibold text-ink">{header}</h3>
      <span className="inline-flex items-center rounded-md bg-inset px-1.5 text-[11.5px] text-ink-2 shadow-hairline tabular-nums">{chunks.length}</span>
    </header>
    {chunks.map(chunk => <article className="overflow-hidden rounded-card bg-surface shadow-card" key={chunk.id}>
      <header className="primitive-card-bar flex items-center gap-2.5 border-b border-line">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        <strong className="min-w-0 text-[13px] font-medium text-ink">{chunk.title}</strong>
      </header>
      <p className="px-3 pt-2 pb-1 text-[12.5px] leading-relaxed text-ink">{chunk.body}</p>
      <div className="px-3 pb-3">
        <button id={`source-${chunk.id}`} type="button" onClick={() => onSource(chunk.id)} aria-label={`${sourceLabel}: ${chunk.source}`}
          className="context-source-button inline-flex h-6 items-center gap-1.5 rounded-full bg-inset px-2 text-[12px] font-medium text-ink-2 shadow-btn hover:bg-hover">
          {chunk.source}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M7 7h10v10" /></svg>
        </button>
      </div>
    </article>)}
  </section>;
}
