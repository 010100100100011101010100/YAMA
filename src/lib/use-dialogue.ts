"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { dialogueApi, type DialogueApi } from "./dialogue-api";
import type { Dialogue, DialogueCommand } from "./dialogue";
import { ReportApiError, type SavedReport } from "./report-api";

type Operation<C = DialogueCommand> = C extends DialogueCommand ? Omit<C, "expectedRevision" | "expectedVersion"> : never;
type PendingReply = { report: SavedReport; operation: Extract<Operation, { operation: "reply" }> };
export function useDialogue(enabled: boolean, report: SavedReport | null, api: DialogueApi = dialogueApi) {
  const [state, setState] = useState<Dialogue | null>(null), [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const reportRef = useRef(report), mounted = useRef(true), working = useRef(false), pending = useRef<PendingReply | null>(null);
  useEffect(() => {
    reportRef.current = report;
    if (pending.current && (pending.current.report._id !== report?._id || pending.current.report.revision !== report?.revision)) pending.current = null;
  }, [report]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const receive = useCallback((received: Dialogue) => {
    if (!mounted.current || reportRef.current?._id !== received.reportId) return;
    setState(current => !current || current.reportId !== received.reportId || received.version >= current.version ? received : current);
  }, []);
  const reportId = report?._id, revision = report?.revision;
  useEffect(() => {
    if (!enabled || !reportId) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let delay = 5000;
      try {
        const received = await api.get(reportId!, controller.signal);
        if (controller.signal.aborted) return;
        receive(received); setReadError("");
        delay = received.turn && ["queued", "running"].includes(received.turn.status) ? 2000 : 5000;
      } catch (failure) {
        if (!controller.signal.aborted) setReadError(failure instanceof ReportApiError ? failure.code : "service_unavailable");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, delay);
      }
    }
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [api, enabled, reportId, revision, receive, refresh]); // Revision changes revoke old turns on the server.

  const mutate = useCallback(async (snapshot: SavedReport, operation: Operation): Promise<boolean> => {
    if (!enabled || working.current) return false;
    working.current = true; setBusy(true); setError("");
    try {
      let current = await api.get(snapshot._id, new AbortController().signal);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (operation.operation === "delivered" && (current.turn?.id !== operation.turnId || current.turn.status !== "ready")) { receive(current); return true; }
          current = await api.change(snapshot._id, { ...operation, expectedRevision: snapshot.revision, expectedVersion: current.version });
          receive(current); return true;
        } catch (failure) {
          if (!(failure instanceof ReportApiError) || failure.code !== "conversation_conflict" || attempt > 0) throw failure;
          current = await api.get(snapshot._id, new AbortController().signal);
        }
      }
      return false;
    } catch (failure) {
      if (mounted.current) setError(failure instanceof ReportApiError ? failure.code : "service_unavailable");
      return false;
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }, [api, enabled, receive]);
  const requestReply = useCallback(async (snapshot: SavedReport, agent: Dialogue["activeAgent"], automatic: boolean, language = snapshot.language) => {
    const messageId = snapshot.messages.at(-1)?.id;
    if (!messageId) return false;
    const old = pending.current;
    const operation: Extract<Operation, { operation: "reply" }> = old?.report._id === snapshot._id && old.report.revision === snapshot.revision && old.operation.agent === agent && old.operation.automatic === automatic && old.operation.language === language
      ? old.operation : { operation: "reply", key: crypto.randomUUID(), messageId, agent, automatic, language };
    pending.current = { report: snapshot, operation };
    const saved = await mutate(snapshot, operation);
    if (saved) pending.current = null;
    return saved;
  }, [mutate]);
  const control = useCallback(async (operation: Operation) => {
    if (operation.operation !== "delivered") pending.current = null;
    return reportRef.current ? mutate(reportRef.current, operation) : false;
  }, [mutate]);
  const deliver = useCallback((turnId: string) => control({ operation: "delivered", turnId }), [control]);
  const retryRead = useCallback(() => { setReadError(""); setRefresh(value => value + 1); }, []);
  function retry(recipient?: Dialogue["activeAgent"]) {
    if (readError && !error) { retryRead(); return; }
    if (pending.current) void mutate(pending.current.report, pending.current.operation).then(saved => { if (saved) pending.current = null; });
    else if (state?.turn?.status === "ready") void deliver(state.turn.id);
    else if (report && state && (!state.turn || ["failed", "canceled", "stale", "delivered"].includes(state.turn.status))) void requestReply(report, recipient ?? state.activeAgent, state.automatic, state.language);
    setRefresh(value => value + 1);
  }
  const current = state?.reportId === report?._id ? state : null;
  return { state: current, error, readError, busy, requestReply, deliver, retry, retryRead, control };
}
