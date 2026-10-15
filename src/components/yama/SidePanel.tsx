"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/atoms/Button";

// A modeless companion on desktop, a native modal sheet on smaller screens.
// The browser owns modal focus trapping; explicit closing returns to the opener.
export default function SidePanel({ open, panelId, title, closeLabel, onClose, children }: {
  open: boolean; panelId: string | null; title: string; closeLabel: string;
  onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const modal = useRef(false);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!open) {
      if (node.open) node.close();
      if (opener.current) {
        const target = opener.current.isConnected && !opener.current.closest("dialog:not([open])") ? opener.current : document.getElementById("message");
        target?.focus({ preventScroll: true });
        opener.current = null;
      }
      return;
    }
    if (!opener.current) opener.current = document.activeElement as HTMLElement;
    const size = window.matchMedia?.("(max-width: 1040px)");
    function show() {
      if (!node) return;
      const shouldBeModal = size?.matches ?? false;
      if (node.open && modal.current !== shouldBeModal) node.close();
      if (!node.open) {
        if (shouldBeModal) node.showModal();
        else node.show();
      }
      modal.current = shouldBeModal;
    }
    show();
    if (content.current) content.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
    size?.addEventListener("change", show);
    return () => size?.removeEventListener("change", show);
  }, [open, panelId]);

  return <dialog ref={dialog} className="side-panel" aria-labelledby="panel-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClose={() => { if (!dialog.current?.open && open) onClose(); }}
    onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); } }}>
    <header className="panel-heading"><h2 id="panel-title" ref={heading} tabIndex={-1}>{title}</h2><Button variant="quiet" size="icon" onClick={onClose} aria-label={closeLabel}><X size={22} /></Button></header>
    <div ref={content} className="panel-content">{children}</div>
  </dialog>;
}
