"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/atoms/Button";
import ApprovalCard from "@/components/primitives/ApprovalCard";
import { actionsApi, type ActionsApi } from "@/lib/actions-api";
import { actionWords } from "@/lib/actions-copy";
import type { ActionPreview } from "@/lib/actions";
import type { SavedReport } from "@/lib/report-api";
import { patternLabel } from "@/lib/persistence-copy";

export function PrivateActionReview({ report, language, disabled = false, api = actionsApi }: { report: SavedReport; language: SavedReport["language"]; disabled?: boolean; api?: ActionsApi }) {
  const [preview, setPreview] = useState<ActionPreview | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const mounted = useRef(false), saving = useRef(false), epoch = useRef(0), pending = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { epoch.current += 1; pending.current?.abort(); }, []);
  const words = actionWords[language];
  const load = useCallback(async () => {
    if (saving.current) return;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    const sequence = ++epoch.current;
    try {
      const draft = await api.preview(report._id, controller.signal);
      if (mounted.current && sequence === epoch.current && !controller.signal.aborted) {
        if (draft.revision !== report.revision) throw new Error("revision_conflict");
        setPreview(draft); setError(false);
      }
    } catch { if (mounted.current && sequence === epoch.current && !controller.signal.aborted) { setError(true); setPreview(null); } }
  }, [api, report._id, report.revision]);
  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    return () => { mounted.current = false; invalidate(); clearTimeout(initial); clearInterval(timer); };
  }, [invalidate, load]);
  async function approve() {
    if (!preview || saving.current || disabled || preview.review.status === "reviewed") return;
    saving.current = true; pending.current?.abort(); const sequence = ++epoch.current; setBusy(true); setError(false);
    try {
      const reviewed = await api.review(report._id, report.revision, preview.receipt);
      if (mounted.current && sequence === epoch.current) setPreview(reviewed);
    } catch { if (mounted.current && sequence === epoch.current) { setError(true); setPreview(null); } }
    finally { saving.current = false; if (mounted.current && sequence === epoch.current) setBusy(false); }
  }
  return <section aria-label={words.title}>
    <h3>{words.title}</h3><p>{words.limit}</p>
    {error ? <div role="alert"><p>{words.error}</p><Button onClick={() => void load()}>{words.refresh}</Button></div> : !preview ? <p role="status">{words.loading}</p> : <>
      <p>{preview.confirmation === "user_confirmed" ? words.confirmed : words.unconfirmed} · {preview.revision}</p>
      <details className="comparison-source"><summary>{words.summary}</summary>
        {preview.summary.map(statement => <section className="next-row" key={statement.id}><div>
          <p dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{statement.field === "pattern" ? patternLabel(statement.value, language) : statement.value}</p>
          <p>{words.polarity[statement.polarity]}</p>
          {statement.originalValue !== statement.value && <p>{words.original}: <span dir="auto">{statement.field === "pattern" ? patternLabel(statement.originalValue, language) : statement.originalValue}</span></p>}
          <p>{words.quote}</p>
          <blockquote dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{statement.quote}</blockquote>
          {statement.evidence && <p style={{ overflowWrap: "anywhere" }}>{statement.evidence.id} · SHA-256 {statement.evidence.sha256}{!statement.evidence.available && ` · ${words.archived}`}</p>}
        </div></section>)}
        <p>{words.omitted}: {preview.omittedAssertionIds.length}</p>
      </details>
      <details className="comparison-source"><summary>{words.files} · {preview.files.length}</summary>
        {!preview.files.length && <p>{words.none}</p>}
        {preview.files.map(file => <section className="next-row" key={file.id}><div style={{ overflowWrap: "anywhere" }}><h3 dir="auto">{file.name}</h3>
          <p>{file.format} · {file.size} B · {words.status[file.status]} · {file.reviewed ? words.reviewed : words.notReviewed}</p>
          <p>SHA-256 {file.sha256}</p>{file.textSha256 && <p>Text SHA-256 {file.textSha256}</p>}
        </div></section>)}
      </details>
      <ApprovalCard resetToken={preview.receipt} questions={[{ q: words.title, type: "check", options: [words.acknowledge] }]}
        labels={{ send: words.save, sentMessage: words.saved }} disabled={disabled || busy} confirmed={preview.review.status === "reviewed"} onSubmitted={() => void approve()} />
      {preview.review.status === "reviewed" && <p role="status">{words.saved} · {new Date(preview.review.reviewedAt).toLocaleString(language === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p>}
    </>}
  </section>;
}
