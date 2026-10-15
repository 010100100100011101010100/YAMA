"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import type { AgentId, Language } from "@/lib/demo-state";
import { agentNature, chatText } from "@/lib/chat-copy";
const AGENT_NAMES = { saathi: "Saathi", drishti: "Drishti", disha: "Disha" };
export default function AgentInfo({
  agent,
  language,
}: {
  agent: AgentId;
  language: Language;
}) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 16, top: 80 });
  const trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    id = useId();
  const copy = chatText(language),
    profile = agentNature[language][agent],
    label =
      language === "en"
        ? `About ${AGENT_NAMES[agent]}`
        : `${AGENT_NAMES[agent]} ${copy.about}`;
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="agent-info-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 326)),
            top: Math.max(
              16,
              Math.min(rect.bottom + 8, window.innerHeight - 240),
            ),
          });
          setOpen(!open);
        }}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${id}-title`}
            className="agent-info-popup"
            style={position}
          >
            <header>
              <h2 id={`${id}-title`}>{label}</h2>
              <button
                ref={closeButton}
                type="button"
                className="agent-info-button"
                aria-label={copy.close}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus({ preventScroll: true });
                }}
              >
                <X size={18} />
              </button>
            </header>
            <strong>{profile.nature}</strong>
            <p>{profile.description}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
