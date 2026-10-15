"use client";

import { FileText, X } from "lucide-react";
import { Button } from "@/components/atoms/Button";
import Folder from "@/components/ui/folder-component";
import type { RefObject } from "react";
import { useState } from "react";
import type { Copy } from "@/lib/copy";
import type { Evidence } from "@/lib/demo-state";
import { validateLocalEvidence } from "@/lib/evidence";

export default function EvidencePicker({ evidence, inputRef, copy, onAdd, onRemove, onAttempt }: {
  evidence: Evidence[]; inputRef: RefObject<HTMLInputElement | null>; copy: Copy;
  onAdd: (evidence: Evidence) => void; onRemove: (id: string) => void; onAttempt: () => void;
}) {
  const [error, setError] = useState<"type" | "size" | null>(null);
  return <section className="evidence-picker" aria-labelledby="evidence-heading">
    <header><h3 id="evidence-heading">{copy.evidence}</h3><span className="small-muted tabular-nums">{evidence.length}</span></header>
    <Folder color="black" size="sm" className="evidence-folder" label={copy.addEvidence} onOpen={() => inputRef.current?.click()} />
    <input ref={inputRef} type="file" tabIndex={-1} aria-hidden="true" className="sr-only" accept="image/png,image/jpeg,application/pdf,text/plain" aria-label={copy.addEvidence}
      onChange={event => {
        const file = event.target.files?.[0];
        if (!file) return;
        onAttempt();
        const invalid = validateLocalEvidence(file);
        setError(invalid);
        if (!invalid) onAdd({ id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type });
        event.target.value = "";
      }} />
    <p className="small-muted">{copy.evidenceNote}</p>
    {error && <p className="error-text" role="alert">{error === "type" ? copy.invalidType : copy.invalidSize}</p>}
    {evidence.map(file => <div className="evidence-row" key={file.id}><FileText size={18} aria-hidden="true" /><span><strong>{file.name}</strong><span>{copy.localFile}</span></span>
      <Button variant="quiet" size="icon" aria-label={`${copy.remove} ${file.name}`} onClick={() => onRemove(file.id)}><X size={17} /></Button>
    </div>)}
  </section>;
}
