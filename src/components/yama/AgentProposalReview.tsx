"use client";

import { useEffect, useRef, useState } from "react";
import ApprovalCard from "@/components/primitives/ApprovalCard";
import { Button } from "@/components/atoms/Button";
import { agentApi, type AgentApi } from "@/lib/agent-api";
import type { AgentTask } from "@/lib/agent-task";
import type { SavedReport } from "@/lib/report-api";
import { agentCopy } from "@/lib/agent-copy";
import { patternLabel } from "@/lib/persistence-copy";
import type { Language } from "@/lib/demo-state";

function validatePreview(task: AgentTask, report: SavedReport): AgentTask {
  if (task.reportId !== report._id) throw new Error("invalid_response");
  if (task.status === "ready" && task.revision !== report.revision) return { ...task, status: "stale", result: null, resultHash: null };
  for (const proposal of task.result?.proposals ?? []) {
    const message = report.messages.find(message => message.id === proposal.source.messageId);
    if (!message || proposal.source.start >= proposal.source.end || proposal.source.end > message.text.length || message.text.slice(proposal.source.start, proposal.source.end) !== proposal.quote) throw new Error("invalid_response");
  }
  return task;
}

function ProposalChoices({ task, report, language, disabled, onAccept }: {
  task: AgentTask; report: SavedReport; language: Language; disabled: boolean; onAccept: (ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const copy = agentCopy(language), proposals = task.result!.proposals;
  const label = (field: typeof proposals[number]["field"]) => field === "note" ? copy.noteField : copy[field];
  return <>
    <label className="include-detail"><input type="checkbox" disabled={disabled} checked={selected.length === proposals.length} onChange={event => setSelected(event.target.checked ? proposals.map(proposal => proposal.id) : [])} />{copy.all}</label>
    {proposals.map(proposal => {
      const original = report.messages.find(message => message.id === proposal.source.messageId)!;
      return <article className="detail-row" key={proposal.id}>
        <div className="detail-heading"><strong>{label(proposal.field)}</strong><span className="source-id">{copy.source} {report.messages.indexOf(original) + 1}</span></div>
        <div className="detail-value"><p>{proposal.field === "pattern" ? patternLabel(proposal.value, language) : proposal.value}</p></div>
        <blockquote>{proposal.quote}</blockquote>
        <details className="review-sources"><summary>{copy.original}</summary><p className="agent-original">{original.text.slice(0, proposal.source.start)}<mark>{proposal.quote}</mark>{original.text.slice(proposal.source.end)}</p></details>
        <label className="include-detail"><input type="checkbox" disabled={disabled} checked={selected.includes(proposal.id)} onChange={event => setSelected(current => event.target.checked ? [...current, proposal.id] : current.filter(id => id !== proposal.id))} />{copy.add} {label(proposal.field)}</label>
      </article>;
    })}
    <div className="approval-footer"><ApprovalCard questions={[{ q: copy.acknowledge, type: "check", options: [copy.acknowledge] }]}
      labels={{ send: copy.accept, sentMessage: copy.accepted }} disabled={disabled || !selected.length}
      onSubmitted={answers => { if (answers[0]?.includes(0) && selected.length && !disabled) void onAccept(selected); }} /></div>
  </>;
}

export default function AgentProposalReview({ report, language, disabled = false, api = agentApi, onAccept, onExample, pollInterval = 2000 }: {
  report: SavedReport | null; language: Language; disabled?: boolean; api?: AgentApi;
  onAccept: (taskId: string, resultHash: string, proposalIds: string[]) => Promise<boolean>;
  onExample: () => Promise<boolean>; pollInterval?: number;
}) {
  const [task, setTask] = useState<AgentTask | null>(null), [loading, setLoading] = useState(!!report), [error, setError] = useState(false);
  const [mutating, setMutating] = useState(false), [waiting, setWaiting] = useState(false), [reload, setReload] = useState(0);
  const generation = useRef(0), mounted = useRef(true), actionButton = useRef<HTMLButtonElement>(null);
  const creation = useRef<{ reportId: string; revision: number; key: string } | null>(null), focusBack = useRef(false);
  const currentReport = useRef(report);
  useEffect(() => { currentReport.current = report; }, [report]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => {
    if (!mutating && !disabled && focusBack.current) {
      actionButton.current?.focus({ preventScroll: true }); focusBack.current = false;
    }
  }, [mutating, disabled]);
  useEffect(() => {
    const ticket = ++generation.current, controller = new AbortController();
    if (!report) return () => controller.abort();
    const snapshot = report;
    let polls = 0;
    async function restore() {
      try {
        const history = await api.list(snapshot._id, controller.signal);
        if (controller.signal.aborted || ticket !== generation.current) return;
        const latest = history[0] ? validatePreview(history[0], snapshot) : null;
        setTask(latest); setLoading(false); setError(false); setWaiting(false);
        if (latest && ["queued", "running"].includes(latest.status)) {
          if (++polls < 60) timer = setTimeout(restore, pollInterval);
          else setWaiting(true);
        }
      } catch {
        if (!controller.signal.aborted && ticket === generation.current) { setLoading(false); setError(true); }
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    void restore();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
    // Source text is immutable within a report revision; don't restart polling on
    // unrelated view preferences or a newly allocated copy of the same report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, report?._id, report?.revision, reload, pollInterval]);

  const visible = task && report && task.reportId === report._id ? task.status === "ready" && task.revision !== report.revision ? { ...task, status: "stale" as const, result: null, resultHash: null } : task : null;
  const copy = agentCopy(language, visible?.adapter.provider ?? null);
  const pending = visible?.status === "queued" || visible?.status === "running";
  async function control() {
    const snapshot = currentReport.current;
    if (!snapshot || disabled || mutating || loading) return;
    const ticket = ++generation.current;
    setMutating(true); setError(false);
    try {
      let receipt: AgentTask;
      if (pending && visible) { receipt = await api.cancel(snapshot._id, visible.id); creation.current = null; }
      else {
        if (creation.current?.reportId !== snapshot._id || creation.current?.revision !== snapshot.revision) creation.current = { reportId: snapshot._id, revision: snapshot.revision, key: crypto.randomUUID() };
        receipt = await api.start(snapshot._id, snapshot.revision, creation.current.key);
        creation.current = null;
      }
      if (mounted.current && ticket === generation.current && currentReport.current?._id === snapshot._id && currentReport.current?.revision === snapshot.revision) {
        setTask(validatePreview(receipt, snapshot)); setReload(value => value + 1);
      }
    } catch { if (mounted.current && ticket === generation.current) setError(true); }
    finally { if (mounted.current) { focusBack.current = ticket === generation.current; setMutating(false); } }
  }
  async function approve(ids: string[]) {
    if (!visible || visible.status !== "ready" || !visible.resultHash || !report || visible.revision !== report.revision || mutating || disabled) return;
    setMutating(true); setError(false); generation.current += 1;
    try {
      const saved = await onAccept(visible.id, visible.resultHash, ids);
      if (mounted.current) {
        setError(!saved); setReload(value => value + 1);
        if (saved) focusBack.current = true;
      }
    } catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setMutating(false); }
  }
  async function addExample() {
    if (disabled || mutating || pending) return;
    setMutating(true); setError(false);
    try {
      const saved = await onExample();
      if (mounted.current) { setError(!saved); focusBack.current = saved; }
    } catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setMutating(false); }
  }
  const status = !report ? copy.start : error ? copy.failed : waiting ? copy.waiting : loading ? copy.loading
    : visible?.status === "queued" ? copy.queued : visible?.status === "running" ? copy.running
    : visible?.status === "ready" ? visible.result?.proposals.length ? copy.ready : copy.empty
    : visible?.status === "accepted" ? copy.added : visible?.status === "canceled" ? copy.canceled : visible?.status === "stale" ? copy.stale : visible?.status === "failed" ? copy.failed : copy.idle;
  return <section className="agent-proposals" aria-label={copy.title}>
    <header className="approval-heading"><h3>{copy.title}</h3><span className="state-tag">{copy.fixture}</span></header>
    <p className="demo-note">{copy.note}</p>
    <p role={error || visible?.status === "failed" ? "alert" : "status"} className="agent-status">{status}</p>
    <div className="button-row"><Button ref={actionButton} variant="secondary" disabled={!report || disabled || mutating || loading} onClick={() => void control()}>{pending ? copy.cancel : copy.extract}</Button>
      {(error || waiting) && <Button variant="quiet" disabled={mutating || disabled} onClick={() => { setLoading(true); setReload(value => value + 1); }}>{copy.reload}</Button>}
    </div>
    {visible?.status === "ready" && report && !!visible.result?.proposals.length && <ProposalChoices key={`${visible.id}:${visible.resultHash}`} task={visible} report={report} language={language} disabled={disabled || mutating || loading || error} onAccept={approve} />}
    {!!visible?.result?.skippedExisting && <p className="demo-note">{copy.skipped}: {visible.result.skippedExisting}</p>}
    <div className="button-row"><Button variant="quiet" disabled={disabled || mutating || pending} onClick={() => void addExample()}>{copy.example}</Button></div>
  </section>;
}
