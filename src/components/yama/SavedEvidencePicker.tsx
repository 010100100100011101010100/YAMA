"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/atoms/Button";
import Folder from "@/components/ui/folder-component";
import type { Copy } from "@/lib/copy";
import type { Language } from "@/lib/demo-state";
import { evidenceApi, type EvidenceApi, type EvidenceSource, type SavedEvidence } from "@/lib/evidence-api";
import { evidenceCopy, evidenceError } from "@/lib/evidence-copy";
import { ReportApiError } from "@/lib/report-api";
import { uploadFormat } from "@/lib/evidence-format";

type Phase = "idle" | "loading" | "uploading" | "extracting" | "opening" | "removing" | "reviewing" | "canceling";
export default function SavedEvidencePicker({ reportId, inputRef, copy, language, disabled, onAttempt, onReview, api = evidenceApi }: {
  reportId: string | null; inputRef: RefObject<HTMLInputElement | null>; copy: Copy; language: Language; disabled: boolean;
  onAttempt: () => void; onReview: (id: string, sha256: string, textSha256?: string) => Promise<boolean>; api?: EvidenceApi;
}) {
  const [files, setFiles] = useState<SavedEvidence[]>([]);
  const [phase, setPhase] = useState<Phase>(reportId ? "loading" : "idle");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{ file: File; key: string } | null>(null);
  const [source, setSource] = useState<EvidenceSource | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [added, setAdded] = useState(false);
  const [reload, setReload] = useState(0);
  const lock = useRef(false), mounted = useRef(true);
  const mutation = useRef(0);
  const section = useRef<HTMLElement>(null), returnFocus = useRef<string | null>(null);
  const text = evidenceCopy(language), busy = disabled || phase !== "idle";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!reportId) return;
    const controller = new AbortController();
    api.list(reportId, controller.signal).then(saved => { if (!controller.signal.aborted) { setFiles(saved); setPhase("idle"); } })
      .catch(failure => { if (!controller.signal.aborted) { setError(failure instanceof ReportApiError ? failure.code : "network_error"); setPhase("idle"); } });
    return () => controller.abort();
  }, [api, reportId, reload]);
  const pending = files.some(file => file.status === "queued" || file.status === "processing");
  useEffect(() => {
    if (!reportId || !pending) return;
    const controller = new AbortController(), deadline = Date.now() + 120_000;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted) return;
      if (Date.now() >= deadline) { setError("processing_waiting"); return; }
      const version = mutation.current;
      try {
        if (!lock.current) {
          const saved = await api.list(reportId!, controller.signal);
          if (!controller.signal.aborted && !lock.current && mutation.current === version) setFiles(saved);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof ReportApiError ? failure.code : "network_error"); return;
      }
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll(); }, 2000);
    }
    timer = setTimeout(() => { void poll(); }, 2000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [api, reportId, pending, reload]);
  useEffect(() => {
    if (phase !== "idle" || !returnFocus.current) return;
    const target = returnFocus.current === "source" ? section.current?.querySelector<HTMLTextAreaElement>("#evidence-text")
      : section.current?.querySelector<HTMLButtonElement>(`button[data-evidence-id="${returnFocus.current}"]`) ?? section.current?.querySelector<HTMLButtonElement>("button");
    target?.focus(); returnFocus.current = null;
  }, [phase]);
  function upsert(saved: SavedEvidence) { if (mounted.current) setFiles(current => [...current.filter(file => file.id !== saved.id), saved]); }
  async function action(nextPhase: Phase, work: () => Promise<void>) {
    if (lock.current || busy || !reportId) return;
    lock.current = true; mutation.current++; setPhase(nextPhase); setError(""); setAdded(false);
    try { await work(); }
    catch (failure) { if (mounted.current) setError(failure instanceof ReportApiError ? failure.code : "network_error"); }
    finally { mutation.current++; lock.current = false; if (mounted.current) setPhase("idle"); }
  }
  async function upload(attempt: { file: File; key: string }) {
    await action("uploading", async () => {
      const saved = await api.upload(reportId!, attempt.file, attempt.key); upsert(saved);
      if (!mounted.current) return;
      setRetry(null);
      if (saved.status !== "ready") { setPhase("extracting"); upsert(await api.extract(reportId!, saved.id)); }
    });
  }
  return <section ref={section} className="evidence-picker" aria-labelledby="evidence-heading">
    <header><h3 id="evidence-heading">{copy.evidence}</h3><span className="small-muted tabular-nums">{files.length}</span></header>
    <Folder color="black" size="sm" className="evidence-folder" label={copy.addEvidence} onOpen={() => { if (!busy && reportId) inputRef.current?.click(); }} />
    <input ref={inputRef} type="file" tabIndex={-1} aria-hidden="true" className="sr-only" accept=".txt,.pdf,.png,.jpg,.jpeg,text/plain,application/pdf,image/png,image/jpeg" aria-label={copy.addEvidence} disabled={busy || !reportId}
      onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        onAttempt();
        const format = uploadFormat(file.name);
        if (!format || file.type && file.type !== format.mime) { setError("unsupported_file_type"); return; }
        if (!file.size || file.size > format.limit) { setError("file_too_large"); return; }
        const attempt = { file, key: crypto.randomUUID() }; setRetry(attempt); void upload(attempt);
      }} />
    <p className="small-muted">{text.note}</p><p className="small-muted">{text.removal}</p>
    {!reportId && <p className="empty-note">{text.start}</p>}
    <p role="status">{phase !== "idle" ? text[phase] : added ? text.added : reportId && !files.length && !error ? text.empty : ""}</p>
    {error && <p className="error-text" role="alert">{evidenceError(error, language)}</p>}
    <div className="button-row">
      {retry && <Button variant="secondary" disabled={busy} onClick={() => { void upload(retry); }}>{text.retryUpload}</Button>}
      {error && !retry && <Button variant="secondary" disabled={busy} onClick={() => { setPhase("loading"); setError(""); setReload(value => value + 1); }}>{text.retryList}</Button>}
    </div>
    {files.map(file => <div className="evidence-row" key={file.id}><FileText size={18} aria-hidden="true" /><span><strong>{file.name}</strong><span>{file.status === "failed" ? evidenceError(file.errorCode ?? "extraction_failed", language) : file.reviewed ? text.reviewed : text[file.status]}</span>
      {["ready", "queued", "processing"].includes(file.status) && <Button data-evidence-id={file.id} variant="secondary" size="sm" disabled={busy} aria-label={`${file.status === "ready" ? text.read : text.cancel} ${file.name}`} onClick={() => { void action(file.status === "ready" ? "opening" : "canceling", async () => {
        returnFocus.current = file.id;
        if (file.status !== "ready") { upsert(await api.cancel(reportId!, file.id)); return; }
        const original = await api.source(reportId!, file.id);
        if (original.sha256 !== file.sha256) throw new ReportApiError("source_changed");
        if (mounted.current) { setSource(original); setAcknowledged(false); returnFocus.current = "source"; }
      }); }}>{file.status === "ready" ? text.read : text.cancel}</Button>}
      {(file.attempts ?? 0) < 3 && (file.status === "stored" || file.status === "canceled" || file.status === "failed" && ["file_unavailable", "extraction_failed", "processing_failed", "processing_timeout", "processing_interrupted", "runtime_unavailable"].includes(file.errorCode ?? "")) && <Button data-evidence-id={file.id} variant="secondary" size="sm" disabled={busy} onClick={() => { void action("extracting", async () => { returnFocus.current = "chooser"; upsert(await api.extract(reportId!, file.id)); }); }}>{text.retryRead}</Button>}
    </span><Button variant="quiet" size="icon" disabled={busy} aria-label={`${text.remove} ${file.name}`} onClick={() => { void action("removing", async () => {
      await api.remove(reportId!, file.id); if (!mounted.current) return;
      setFiles(current => current.filter(entry => entry.id !== file.id)); if (source?.evidenceId === file.id) setSource(null); returnFocus.current = file.id;
    }); }}><X size={17} /></Button></div>)}
    {source && <div className="source-inspection">
      <label htmlFor="evidence-text"><strong>{text.title}</strong></label>
      {source.extraction?.pages.some(page => page.method === "ocr") && <p>{text.ocr}</p>}
      <textarea id="evidence-text" readOnly rows={8} value={source.text} className="w-full resize-y rounded-control bg-field p-3 text-ink" />
      <details><summary>{text.record}</summary><p className="break-all">SHA-256: {source.sha256}</p>{source.extraction && <><p className="break-all">{text.textHash}: {source.extraction.textSha256}</p><p>{text.pages}: {source.extraction.pages.length}</p></>}</details>
      {!files.find(file => file.id === source.evidenceId)?.reviewed && <><label className="include-detail"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} />{text.acknowledge}</label>
        <Button variant="primary" disabled={busy || !acknowledged} onClick={() => { void action("reviewing", async () => {
          const saved = source.extraction ? await onReview(source.evidenceId, source.sha256, source.extraction.textSha256) : await onReview(source.evidenceId, source.sha256);
          if (saved && mounted.current) { setFiles(current => current.map(file => file.id === source.evidenceId ? { ...file, reviewed: true } : file)); returnFocus.current = source.evidenceId; setSource(null); setAdded(true); }
        }); }}>{text.add}</Button></>}
      <Button variant="secondary" disabled={busy} onClick={() => { section.current?.querySelector<HTMLButtonElement>(`button[data-evidence-id="${source.evidenceId}"]`)?.focus(); setSource(null); }}>{text.close}</Button>
    </div>}
  </section>;
}
