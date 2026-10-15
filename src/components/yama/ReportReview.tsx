"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Pencil } from "lucide-react";
import type { Copy } from "@/lib/copy";
import type { DemoAction, DemoState, Detail } from "@/lib/demo-state";
import { hasCurrentConfirmation } from "@/lib/demo-state";
import ContextCards from "@/components/primitives/ContextCards";
import ApprovalCard from "@/components/primitives/ApprovalCard";
import FilterTable from "@/components/primitives/FilterTable";
import { Button } from "@/components/atoms/Button";
import { patternLabel, patternOptions, persistenceText } from "@/lib/persistence-copy";
import type { Language } from "@/lib/demo-state";
import { agentCopy } from "@/lib/agent-copy";

export function detailLabel(copy: Copy, id: string, field?: Detail["field"]) {
  const kind = field ?? id;
  return kind === "story" || kind === "narrative" ? copy.story : kind === "amount" ? copy.amount : kind === "item" ? copy.item : kind === "date" ? copy.date : kind === "pattern" ? copy.pattern : copy.note;
}

function DetailRow({ detail, copy, onEdit, onInclude, language, busy, onPolarity, sourceNumber }: { detail: Detail; copy: Copy; language: Language; busy: boolean; sourceNumber: number;
  onEdit: (value: string) => void | Promise<boolean>; onInclude: (included: boolean) => void; onPolarity: (polarity: NonNullable<Detail["polarity"]>) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(detail.value);
  const [error, setError] = useState(false);
  const focusBack = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!editing && focusBack.current) { editButton.current?.focus({ preventScroll: true }); focusBack.current = false; } }, [editing]);
  const pattern = detail.field === "pattern";
  const label = pattern ? patternLabel(detail.value, language) : detailLabel(copy, detail.id, detail.field);
  const text = persistenceText(language);
  return <article className={`detail-row ${!detail.included ? "is-excluded" : ""}`}>
    <div className="detail-heading"><strong>{label}</strong><span className="source-id">{detail.sourceId === "example-story" ? "Example · 1" : `${copy.source} ${sourceNumber}`}</span></div>
    {detail.agentSource && <p className="demo-note">{agentCopy(language, detail.agentSource.provider).reference}</p>}
    {editing ? <form className="detail-edit" onSubmit={event => {
      event.preventDefault();
      if (!value.trim()) { setError(true); return; }
      const complete = (saved?: boolean | void) => { if (saved !== false) { focusBack.current = true; setEditing(false); } };
      const saved = onEdit(value);
      if (saved) void saved.then(complete); else complete();
    }}>
      <label className="sr-only" htmlFor={`edit-${detail.id}`}>{label}</label>
      {pattern ? <select autoFocus id={`edit-${detail.id}`} value={value} disabled={busy} onChange={event => setValue(event.target.value)}>
        {patternOptions.map(option => <option key={option} value={option}>{patternLabel(option, language)}</option>)}
      </select> : <textarea autoFocus id={`edit-${detail.id}`} rows={(detail.field ?? detail.id) === "amount" ? 1 : 3} value={value} readOnly={busy} onChange={event => setValue(event.target.value)} maxLength={6000} aria-invalid={error || undefined} aria-describedby={error ? `error-${detail.id}` : undefined} />}
      {error && <p className="error-text" id={`error-${detail.id}`}>{copy.emptyField}</p>}
      <div className="button-row"><Button type="submit" variant="primary" size="sm" disabled={busy} aria-label={`${copy.save} ${label}`}><Check size={14} />{copy.save}</Button><Button variant="secondary" size="sm" disabled={busy} onClick={() => { focusBack.current = true; setEditing(false); }}>{copy.cancel}</Button></div>
    </form> : <div className="detail-value"><p>{pattern ? patternLabel(detail.value, language) : detail.value}</p><Button ref={editButton} variant="quiet" size="icon" disabled={busy} aria-label={`${copy.edit} ${label}`} onClick={() => { setValue(detail.value); setError(false); setEditing(true); }}><Pencil size={15} /></Button></div>}
    {detail.value !== detail.originalValue && <details className="correction"><summary>{copy.corrected}</summary><p>{copy.extracted}: {pattern ? patternLabel(detail.originalValue, language) : detail.originalValue}</p></details>}
    <label className="include-detail"><input type="checkbox" checked={detail.included} disabled={busy} onChange={event => onInclude(event.target.checked)} />{detail.included ? copy.include : copy.excluded}</label>
    {pattern && <label className="include-detail">{text.support}<select aria-label={`${text.support}: ${label}`} value={detail.polarity ?? "affirmed"} disabled={busy} onChange={event => onPolarity(event.target.value as NonNullable<Detail["polarity"]>)}>
      <option value="affirmed">{text.affirmed}</option><option value="contradicted">{text.contradicted}</option><option value="uncertain">{text.uncertain}</option>
    </select></label>}
  </article>;
}

export default function ReportReview({ state, copy, dispatch, onRun, busy = false }: {
  state: DemoState; copy: Copy; dispatch: (action: DemoAction) => void | Promise<boolean>; onRun: () => void; busy?: boolean;
}) {
  const [source, setSource] = useState<string | null>(null);
  const sources = state.messages.filter(message => message.agent === "you");
  if (!state.details.length) return <p className="empty-note">{copy.emptyReview}</p>;
  return <div className="review-layout">
    {state.example && state.details.some(detail => (detail.field ?? detail.id) === "amount" && detail.included && detail.value === detail.originalValue) && <p className="margin-note">{copy.extractionNote}</p>}
    <section className="approval-card" aria-label={copy.review}>
      <header className="approval-heading"><h3>{copy.outline}</h3><span className="state-tag">{hasCurrentConfirmation(state) ? copy.confirmedLabel : copy.draft}</span></header>
      {state.details.map(detail => <DetailRow key={detail.id} detail={detail} copy={copy} language={state.language} busy={busy} sourceNumber={sources.findIndex(message => message.id === detail.sourceId) + 1}
        onEdit={value => dispatch({ type: "edit-detail", id: detail.id, value })} onInclude={included => { void dispatch({ type: "include-detail", id: detail.id, included }); }} onPolarity={polarity => { void dispatch({ type: "detail-polarity", id: detail.id, polarity }); }} />)}
      <div className="approval-footer">
        <ApprovalCard key={state.revision} questions={[{ q: copy.confirmationNote, type: "check", options: [copy.acknowledge] }]}
          labels={{ send: copy.confirm, sentMessage: copy.confirmedLabel }} confirmed={hasCurrentConfirmation(state)} disabled={busy || !state.details.some(detail => detail.included)}
          onSubmitted={answers => dispatch({ type: "confirm", acknowledged: answers[0]?.includes(0) ?? false })} />
        {hasCurrentConfirmation(state) && <Button variant="primary" disabled={busy || state.task?.status === "running"} onClick={onRun}>{copy.runComparison}<ArrowRight size={16} /></Button>}
      </div>
    </section>
    <details className="review-sources"><summary>{state.language === "hi" ? "जानकारी की स्थिति" : "Detail status"}</summary>
      <FilterTable rows={state.details.map((detail, index) => ({ task: `${detailLabel(copy, detail.id, detail.field)} ${index + 1}`, date: detail.sourceId === "example-story" ? "Example 1" : `${copy.source} ${sources.findIndex(message => message.id === detail.sourceId) + 1}`, status: detail.included ? "done" : "todo", owner: "Saathi" }))}
        labels={{ columns: { task: copy.note, date: copy.source, status: state.language === "hi" ? "स्थिति" : "Status", owner: state.language === "hi" ? "एजेंट" : "Agent" }, all: state.language === "hi" ? "सभी" : "All", todo: copy.excluded, progress: copy.checking, done: copy.include, region: copy.outline }} />
    </details>
    <details className="review-sources"><summary>{copy.sourceTitle} ({sources.length})</summary>
      <ContextCards chunks={sources.map((message, index) => ({ id: message.id, title: message.evidenceSource ? `${copy.source}: ${message.evidenceSource.name}` : `${copy.original} ${index + 1}`, body: message.text, source: `${copy.source} ${index + 1}` }))}
        header={copy.sourceTitle} sourceLabel={copy.viewSource} onSource={setSource} />
      {source && <div className="source-inspection" tabIndex={0}><strong>{copy.original}</strong><p>{sources.find(message => message.id === source)?.text}</p><Button variant="secondary" size="sm" onClick={() => { document.getElementById(`source-${source}`)?.focus({ preventScroll: true }); setSource(null); }}>{copy.closeSource}</Button></div>}
    </details>
  </div>;
}
