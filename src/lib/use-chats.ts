"use client";
import { useCallback, useEffect, useState } from "react";
import type { ReportApi, SavedReport } from "./report-api";
import type { ChatSummary, ChatStatus } from "./chat";
export function useChats(
  enabled: boolean,
  api: ReportApi,
  report: SavedReport | null,
) {
  const [chats, setChats] = useState<ChatSummary[]>([]),
    [status, setStatus] = useState<ChatStatus | null>(null),
    [loading, setLoading] = useState(enabled && !!api.list),
    [error, setError] = useState(false),
    [statusError, setStatusError] = useState(false),
    [saving, setSaving] = useState(false),
    [refresh, setRefresh] = useState(0);
  const id = report?._id,
    revision = report?.revision;
  useEffect(() => {
    if (!enabled || !api.list) return;
    const controller = new AbortController();
    api
      .list(controller.signal)
      .then((saved) => {
        if (!controller.signal.aborted) {
          setChats(saved);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, api, id, revision, refresh]);
  useEffect(() => {
    if (!enabled || !id || !api.chatStatus) return;
    const controller = new AbortController();
    api
      .chatStatus(id, controller.signal)
      .then((saved) => {
        if (!controller.signal.aborted) setStatus(saved);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatusError(true);
      });
    return () => controller.abort();
  }, [enabled, api, id, refresh]);
  const toggle = useCallback(async () => {
    if (!status || status.reportId !== id || !api.setChatStatus || saving)
      return;
    setSaving(true);
    setStatusError(false);
    try {
      const saved = await api.setChatStatus(
        status.reportId,
        status.resolution === "resolved" ? "unresolved" : "resolved",
        status.version,
      );
      setStatus(saved);
      setRefresh((value) => value + 1);
    } catch {
      setStatusError(true);
    } finally {
      setSaving(false);
    }
  }, [api, status, saving, id]);
  const fallback: ChatSummary[] =
    report && !chats.some((chat) => chat._id === report._id)
      ? [
          {
            _id: report._id,
            title:
              report.messages[0]?.text
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 96) ?? "",
            language: report.language,
            resolution: status?.resolution ?? "unresolved",
            statusVersion: status?.version ?? 0,
          },
        ]
      : [];
  return {
    chats: [...fallback, ...chats],
    status: status?.reportId === id ? status : null,
    loading,
    error,
    statusError,
    saving,
    toggle,
    retry: () => {
      setStatusError(false);
      setLoading(!!api.list);
      setRefresh((value) => value + 1);
    },
  };
}
