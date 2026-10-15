"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import GlideMenu from "./GlideMenu";

// BeautifulUI SidebarNav (MIT), supplied persistent tree, collapse and GlideMenu rows.
// Yama supplies actual navigation and agent identities; Lucide replaces paid Central Icons.
export type SidebarItem = { key: string; label: string; icon: ReactNode; active: boolean; count?: number };
export default function SidebarNav({ children, footer, items, onNavigate, label, collapseLabel, expandLabel, closeLabel = "Close sidebar" }: {
  children: ReactNode; footer: ReactNode; items: SidebarItem[]; onNavigate: (key: string) => void;
  label: string; collapseLabel: string; expandLabel: string; closeLabel?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  const subscribe = useCallback((notify: () => void) => {
    const viewport = window.matchMedia("(max-width: 1040px)");
    const update = () => { setDrawerOpen(false); notify(); };
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  const compact = useSyncExternalStore(subscribe, () => window.matchMedia("(max-width: 1040px)").matches, () => false);

  useEffect(() => {
    const node = drawer.current;
    if (!node) return;
    if (drawerOpen && !node.open) {
      node.showModal();
      closeButton.current?.focus({ preventScroll: true });
    } else if (!drawerOpen && node.open) {
      node.close();
      // Opening another panel may already have moved focus into that panel.
      if (!document.activeElement || document.activeElement === document.body || node.contains(document.activeElement)) {
        opener.current?.focus({ preventScroll: true });
      }
    }
  }, [compact, drawerOpen]);

  const content = <>
    <div className="rail-content">
      {children}
      {items.length > 0 && <nav className="room-tools" aria-label={label}>
        <GlideMenu rowSelector="[data-row]" highlightClassName="sidebar-glide-highlight inset-x-0 rounded-[7px] bg-hover" className="flex flex-col gap-1">
          {items.map(item => <button key={item.key} data-row data-sidebar-dismiss type="button" aria-label={item.label} aria-expanded={item.active} onClick={() => onNavigate(item.key)} className={`sidebar-row relative z-10 flex h-8 items-center rounded-[8px] px-2 text-left text-[14px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] text-ink-2 ${item.active ? "bg-hover" : ""}`}>
            <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span><span className="sidebar-copy ml-2 min-w-0 flex-1">{item.label}</span>{item.count !== undefined && item.count > 0 && <span aria-hidden className="sidebar-copy note-count">{item.count}</span>}
          </button>)}
        </GlideMenu>
      </nav>}
    </div>
    <div hidden={!compact && collapsed} className="rail-settings sidebar-footer">{footer}</div>
  </>;

  return <aside data-beautifului="SidebarNav" data-sidebar-collapsed={!compact && collapsed} aria-label={label} className="workspace-rail beautiful-sidebar relative shrink-0 overflow-hidden">
    <div className="sidebar-inner flex min-h-0 w-full flex-1 flex-col">
      <header className="rail-brand relative">
        <button ref={opener} type="button" className="sidebar-collapse-control flex items-center justify-center rounded-[8px] text-ink-3 transition-[background-color,color] duration-150 hover:bg-hover-2 hover:text-ink" aria-label={(compact ? !drawerOpen : collapsed) ? expandLabel : collapseLabel} aria-expanded={compact ? drawerOpen : !collapsed} aria-controls={contentId} aria-haspopup={compact ? "dialog" : undefined} onClick={() => compact ? setDrawerOpen(!drawerOpen) : setCollapsed(!collapsed)}>{compact || collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button>
        <a className="wordmark sidebar-copy" href="/" aria-label="Yama home">yama</a>
      </header>
      {compact ? <dialog ref={drawer} id={contentId} className="sidebar-drawer" aria-label={label}
        onCancel={event => { event.preventDefault(); setDrawerOpen(false); }}
        onClose={() => setDrawerOpen(false)}
        onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); setDrawerOpen(false); } }}
        onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setDrawerOpen(false); } }}
        onClickCapture={event => { if ((event.target as HTMLElement).closest("button[data-sidebar-dismiss]:not(:disabled)")) setDrawerOpen(false); }}>
        <header className="sidebar-drawer-header"><span className="wordmark">yama</span><button ref={closeButton} type="button" className="sidebar-collapse-control" aria-label={closeLabel} onClick={() => setDrawerOpen(false)}><X size={20}/></button></header>
        {content}
      </dialog> : <div id={contentId} className="sidebar-body">{content}</div>}
    </div>
  </aside>;
}
