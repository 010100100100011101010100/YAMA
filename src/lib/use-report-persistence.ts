"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { type DemoAction, type DemoState } from "./demo-state";
import { reportApi, ReportApiError, type ReportApi, type ReportChange } from "./report-api";
import { ReportSession, waitForConnections } from "./report-session";
import { reportAction } from "./report-view-state";

export type SavePhase = "loading" | "ready" | "saving" | "error" | "session_lost";
export function useReportPersistence(enabled: boolean, state: DemoState, dispatch: Dispatch<DemoAction>, api: ReportApi = reportApi, initialReportId?:string|null) {
  const [session] = useState(() => new ReportSession(api));
  const [phase, setPhase] = useState<SavePhase>(enabled ? "loading" : "ready");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [connected, setConnected] = useState(!enabled);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    session.restore(controller.signal, reload > 0, initialReportId).then(report => {
      if (controller.signal.aborted) return;
      if (report) {
        dispatch({ ...reportAction(report), restored: true, language: report.language });
        if (report.confirmation?.revision === report.revision) dispatch({ type: "resume-task", id: crypto.randomUUID() });
      }
      setPhase("ready"); setError(""); setConnected(true);
    }).catch(failure => {
      if (controller.signal.aborted) return;
      setPhase("error"); setError(failure instanceof ReportApiError ? failure.code : "service_unavailable");
    });
    return () => controller.abort();
  }, [dispatch, enabled, reload, session, initialReportId]);
  const task = state.task;
  useEffect(() => {
    if (!enabled || task?.status !== "running" || !session.report || session.report.revision !== task.revision) return;
    const controller = new AbortController();
    waitForConnections(api, session.report, controller.signal).then(result => {
      if (!controller.signal.aborted) dispatch({ type: "finish-task", id: task.id, revision: task.revision, outcome: "ready", result });
    }).catch(failure => {
      if (controller.signal.aborted) return;
      if (failure instanceof ReportApiError && ["revision_conflict", "confirmation_required"].includes(failure.code)) {
        dispatch({ type: "unsynced-report" }); setError(failure.code); setPhase("error");
      } else {
        dispatch({ type: "finish-task", id: task.id, revision: task.revision, outcome: "failed" });
        setError(failure instanceof ReportApiError ? failure.code : "service_unavailable");
        if (failure instanceof ReportApiError && failure.code === "authentication_required") {
          dispatch({ type: "unsynced-report" }); setPhase("session_lost");
        }
      }
    });
    return () => controller.abort();
  }, [api, dispatch, enabled, session, task]);

  async function write(action: DemoAction): Promise<boolean> {
    if (working.current || !connected || phase === "loading" || phase === "session_lost") return false;
    if (action.type === "confirm" && !action.acknowledged) { dispatch(action); return false; }
    const change: ReportChange | null = action.type === "accept-proposals" ? { operation: "accept_agent_proposals", taskId: action.taskId, resultHash: action.resultHash, proposalIds: action.proposalIds }
      : action.type === "edit-detail" ? { operation: "correct_assertion", assertionId: action.id, value: action.value }
      : action.type === "include-detail" ? { operation: "correct_assertion", assertionId: action.id, included: action.included }
      : action.type === "detail-polarity" ? { operation: "correct_assertion", assertionId: action.id, polarity: action.polarity }
      : action.type === "review-evidence" ? { operation: "review_evidence", evidenceId: action.id, sha256: action.sha256, textSha256: action.textSha256 } : null;
    if (change && session.unchanged(change)) return true;
    working.current = true; setPhase("saving"); setError(""); dispatch({ type: "unsynced-report" });
    try {
      if (action.type === "send-message") await session.send(action.text, state.language);
      else if (action.type === "load-example") await session.addExample(state.language);
      else if (action.type === "confirm") await session.confirm();
      else if (change) await session.revise(change);
      if (mounted.current && session.report) {
        dispatch(reportAction(session.report));
        setPhase("ready");
      }
      return true;
    } catch (failure) {
      if (mounted.current) {
        if (session.report) dispatch(reportAction(session.report));
        if (!session.synchronized) dispatch({ type: "unsynced-report" });
        const code = failure instanceof ReportApiError ? failure.code : "service_unavailable";
        setPhase(code === "authentication_required" ? "session_lost" : "error"); setError(code);
      }
      return false;
    } finally { working.current = false; }
  }
  function handle(action: DemoAction): void | Promise<boolean> {
    if (enabled && action.type === "start-task") setError("");
    if (enabled && ["send-message", "load-example", "edit-detail", "include-detail", "detail-polarity", "review-evidence", "accept-proposals", "confirm"].includes(action.type)) return write(action);
    dispatch(action);
  }
  function adoptReport(report: import("./report-api").SavedReport) {
    if (!session.adopt(report)) return;
    dispatch(reportAction(report)); setPhase("ready"); setError("");
  }
  return { handle, phase, error, report: session.report, currentReport: () => session.report, busy: enabled && (!connected || ["loading", "saving", "session_lost"].includes(phase)),
    adoptReport, retryLoad: () => { setPhase("loading"); setError(""); setReload(value => value + 1); } };
}
