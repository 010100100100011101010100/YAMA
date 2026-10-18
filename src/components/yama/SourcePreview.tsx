"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function SourcePreview({ title, preview, href, onOpen, inline = false }: { title: string; preview: string; href: string; onOpen?: () => void; inline?: boolean }) {
  const id = useId(), link = useRef<HTMLAnchorElement>(null);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const closeSoon = () => { keepOpen(); closeTimer.current = setTimeout(() => { setPosition(null); setDismissed(false); }, 200); };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  function show() {
    keepOpen();
    if (dismissed) return;
    const rect = link.current?.getBoundingClientRect();
    if (rect) {
      const above = rect.top - 20, below = window.innerHeight - rect.bottom - 20;
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 320)),
        ...(above >= below ? { bottom: window.innerHeight - rect.top + 8, maxHeight: above }
          : { top: rect.bottom + 8, maxHeight: below }) });
    }
  }
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); setDismissed(true); } };
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); document.removeEventListener("keydown", escape); };
  }, [position]);
  return <><a ref={link} className={inline ? "reply-inline-source" : "reply-source-link"} href={href} aria-describedby={position ? id : undefined}
    onMouseEnter={show} onFocus={show} onMouseLeave={closeSoon} onBlur={() => { setPosition(null); setDismissed(false); }}
    onClick={event => { if (onOpen) { event.preventDefault(); onOpen(); } setPosition(null); }}
    {...(!onOpen ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{title}</a>
    {position && createPortal(<div id={id} role="tooltip" className="source-hover-preview" style={position} onMouseEnter={keepOpen} onMouseLeave={closeSoon}><strong>{title}</strong><p>{preview.slice(0, 220)}</p></div>, document.body)}</>;
}
