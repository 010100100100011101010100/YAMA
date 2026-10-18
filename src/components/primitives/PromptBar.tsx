"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/atoms/Button";
import GlideMenu from "./GlideMenu";
import type { Copy } from "@/lib/copy";

// BeautifulUI PromptBar (MIT), supplied source: docs/design/beautifului-supplied/PromptBar.tsx.txt.
// Tall composer, @ and / menus, gliding rows, agent picker and tactile send control.
// The app owns actions and drafts. No gallery autoplay, shader upgrade, or fake dictation.
export type PromptAction = { key: string; name: string; description: string; onPick?: () => void; insertText?: string; keywords?: string[] };
export default function PromptBar({ value, onChange, onSend, onAttach, error, copy, placeholder, agentControl, sourceActions = [], commandActions = [], mentionActions = [], mentionLabel = "Agents", onVoice, disabled = false, pending = false, maxLength = 6000 }: {
  value: string; onChange: (value: string) => void; onSend: () => void;
  maxLength?: number;
  onAttach: () => void; error: boolean; copy: Copy; placeholder?: string; agentControl?: ReactNode;
  sourceActions?: PromptAction[]; commandActions?: PromptAction[]; mentionActions?: PromptAction[]; mentionLabel?: string; onVoice?: () => void;
  disabled?: boolean; pending?: boolean;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [caret, setCaret] = useState(value.length);
  const selection = useRef<number | null>(null);
  const menuId = useId();
  const [position, setPosition] = useState({ left: 12, bottom: 0, width: 320 });
  const token = /(^|\s)([@/])([\p{L}\p{M}\p{N}_-]*)$/u.exec(value.slice(0, caret));
  const menu = !disabled && !pending && (plusOpen ? "sources" : !dismissed && token?.[2]);
  const query = plusOpen ? "" : token?.[3]?.toLowerCase() ?? "";
  const agentMenu = menu === "@" && mentionActions.length > 0;
  const rows = (menu === "/" ? commandActions : agentMenu ? mentionActions : sourceActions).filter(action => [action.name, ...(action.keywords ?? [])].some(name => name.toLowerCase().includes(query)));
  function close() { setPlusOpen(false); setDismissed(true); }
  function pick(action: PromptAction) {
    if (disabled || pending) return;
    if (token && !plusOpen) {
      const start = token.index + token[1].length;
      const suffix = value.slice(caret + (/^[\p{L}\p{M}\p{N}_-]+/u.exec(value.slice(caret))?.[0].length ?? 0));
      const inserted = /^\s/u.test(suffix) ? (action.insertText ?? "").trimEnd() : action.insertText ?? "";
      selection.current = start + inserted.length;
      setCaret(selection.current);
      onChange(value.slice(0, start) + inserted + suffix);
    }
    close(); input.current?.focus({ preventScroll: true }); action.onPick?.();
  }
  useLayoutEffect(() => {
    if (selection.current !== null) {
      input.current?.setSelectionRange(selection.current, selection.current);
      selection.current = null;
    }
  }, [value]);
  useEffect(() => {
    if (!menu || !anchor.current) return;
    const measure = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect) setPosition({ left: Math.max(12, rect.left), bottom: innerHeight - rect.top + 8, width: Math.min(rect.width, innerWidth - 24) });
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-promptbar], [data-prompt-menu]")) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); input.current?.focus({ preventScroll: true }); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("scroll", measure); };
  }, [menu]);
  function send() {
    if (!value.trim() || disabled || pending) return;
    close();
    onSend();
    input.current?.focus({ preventScroll: true });
  }
  return (
    <form data-promptbar data-beautifului="PromptBar" className="w-full" onSubmit={event => { event.preventDefault(); send(); }}>
      <div ref={anchor} className="prompt-bar relative isolate flex flex-col overflow-hidden gap-2.5 p-3.5 rounded-[22px] border border-line bg-surface shadow-card transition-[border-color,border-radius] duration-150 focus-within:border-line-strong">
        <label htmlFor="message" className="sr-only">{copy.write}</label>
        <div className="prompt-grid grid items-end gap-x-1 gap-y-1.5">
          <textarea ref={input} id="message" value={value} onChange={event => { onChange(event.target.value); setCaret(event.target.selectionStart); setDismissed(false); setPlusOpen(false); setActive(0); }}
            onSelect={event => setCaret(event.currentTarget.selectionStart)}
            className="col-span-full col-start-1 row-start-1 min-h-[68px] min-w-0 w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-5 text-ink outline-none placeholder:text-ink-3"
            placeholder={placeholder ?? copy.placeholder} maxLength={maxLength} rows={2} aria-describedby={error ? "message-error" : "message-hint"}
            aria-invalid={error || undefined} readOnly={pending}
            aria-autocomplete={agentMenu ? "list" : undefined} aria-controls={agentMenu && rows.length ? menuId : undefined}
            aria-activedescendant={agentMenu && rows.length ? `${menuId}-${rows[active % rows.length].key}` : undefined}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (menu && rows.length > 0) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((active + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length); return; }
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); pick(rows[active % rows.length]); return; }
              }
              if (event.key === "Escape") { close(); return; }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
            }} />
          <Button variant="quiet" size="icon" className="col-start-1 row-start-2 text-ink-3" disabled={disabled || pending} onClick={() => { if (!sourceActions.length) { onAttach(); return; } setPlusOpen(!plusOpen); setDismissed(false); setActive(0); }} aria-label={copy.addEvidence} aria-expanded={plusOpen}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </Button>
          <div className="col-start-2 row-start-2 min-w-0">{agentControl}</div>
          {onVoice && <Button variant="quiet" size="icon" className="col-start-4 row-start-2 justify-self-end text-ink-3" aria-label={`${copy.voiceMode} · ${copy.previewTag}`} onClick={onVoice}><svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" /></svg></Button>}
          <Button type="submit" variant="primary" size="icon" className={`${onVoice ? "col-start-5" : "col-start-4"} row-start-2`}
            aria-label={copy.send} disabled={!value.trim() || disabled}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </Button>
        </div>
        {error && <p id="message-error" className="error-text" role="alert">{copy.sendFailed}</p>}
      </div>
      {menu && rows.length > 0 && createPortal(<div data-prompt-menu id={menuId} role={agentMenu ? "listbox" : undefined} aria-label={agentMenu ? mentionLabel : undefined} className="prompt-menu fixed z-50 max-h-[45dvh] overflow-y-auto rounded-[10px] bg-surface p-1 shadow-raised" style={{ left: position.left, bottom: position.bottom, width: position.width }}>
        {!agentMenu && <span className="sr-only" role="status" aria-live="polite">{rows[active % rows.length].name}: {rows[active % rows.length].description}</span>}
        <GlideMenu className="flex flex-col gap-1" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
          {rows.map((row, index) => <button key={row.key} id={`${menuId}-${row.key}`} data-menu-row type="button" role={agentMenu ? "option" : undefined} aria-selected={agentMenu ? active % rows.length === index : undefined} tabIndex={agentMenu ? -1 : undefined} onClick={() => pick(row)} onMouseEnter={() => setActive(index)} className={`relative z-10 flex min-h-11 w-full items-center gap-2.5 rounded-[6px] px-2 py-1 text-left ${active === index ? "bg-hover" : ""}`}>
            <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.name}</span>{" "}<span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{row.description}</span>
          </button>)}
        </GlideMenu>
      </div>, document.body)}
      <span id="message-hint" className="sr-only">{copy.sendHint}</span>
    </form>
  );
}
