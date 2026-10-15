import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDialogue } from "@/lib/use-dialogue";
import type { DialogueApi } from "@/lib/dialogue-api";
import type { Dialogue, DialogueCommand } from "@/lib/dialogue";
import { ReportApiError } from "@/lib/report-api";
import { savedReport, reportId } from "./report-fixtures";
import { AGENT_ADAPTER } from "@/lib/agent-task";

function gateway() {
  let state: Dialogue = { reportId, version: 0, activeAgent: "saathi", automatic: true, language: "en", messages: [], turn: null };
  const commands: DialogueCommand[] = [];
  const api: DialogueApi = { get: vi.fn(async () => structuredClone(state)), change: vi.fn(async (_id, command) => {
    commands.push(command);
    if (commands.length === 1) throw new ReportApiError("network_error");
    state = { ...state, version: state.version + 1 };
    if (command.operation === "language") state.language = command.language;
    return structuredClone(state);
  }) };
  return { api, commands };
}
describe("pending reply intent recovery", () => {
  it("recovers a failed background read automatically without requesting another model reply", async () => {
    vi.useFakeTimers();
    const fixture = gateway(), report = savedReport();
    vi.mocked(fixture.api.get).mockRejectedValueOnce(new ReportApiError("network_error"));
    const { result, unmount } = renderHook(() => useDialogue(true, report, fixture.api));
    try {
      await act(async () => {});
      expect(result.current.readError).toBe("network_error");
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(result.current.state?.reportId).toBe(reportId);
      expect(result.current.readError).toBe("");
      expect(fixture.api.change).not.toHaveBeenCalled();
    } finally { unmount(); vi.useRealTimers(); }
  });

  it("retries a failed read of a delivered conversation without generating a duplicate reply", async () => {
    vi.useFakeTimers();
    const fixture = gateway(), report = savedReport();
    const entry = { id: crypto.randomUUID(), agent: "disha" as const, revision: 1, messageId: report.messages[0].id,
      text: "Saved Disha reply", adapter: AGENT_ADAPTER, language: "en" as const };
    const delivered: Dialogue = { reportId, version: 4, activeAgent: "disha", automatic: true, language: "en", messages: [entry],
      turn: { ...entry, status: "delivered", reply: { text: entry.text, handoff: null }, errorCode: null } };
    vi.mocked(fixture.api.get).mockResolvedValue(delivered).mockResolvedValueOnce(delivered).mockRejectedValueOnce(new ReportApiError("network_error"));
    const { result, unmount } = renderHook(() => useDialogue(true, report, fixture.api));
    try {
      await act(async () => {});
      expect(result.current.state?.turn?.status).toBe("delivered");
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(result.current.readError).toBe("network_error");
      await act(async () => { result.current.retry(); });
      expect(result.current.readError).toBe("");
      expect(result.current.state?.messages).toEqual([entry]);
      expect(result.current.state?.turn?.id).toBe(entry.id);
      expect(fixture.api.change).not.toHaveBeenCalled();
    } finally { unmount(); vi.useRealTimers(); }
  });

  it("creates a fresh revision-bound request after notes change", async () => {
    const fixture = gateway(), original = savedReport();
    const { result, rerender } = renderHook(({ report }) => useDialogue(true, report, fixture.api), { initialProps: { report: original } });
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => { await result.current.requestReply(original, "saathi", true); });
    rerender({ report: savedReport(2) });
    act(() => result.current.retry());
    await waitFor(() => expect(fixture.commands).toHaveLength(2));
    const requests = fixture.commands.filter(command => command.operation === "reply");
    expect(requests[1].key).not.toBe(requests[0].key); expect(requests[1].expectedRevision).toBe(2);
  });
  it("does not restore an old language intent after the user changes preference", async () => {
    const fixture = gateway(), report = savedReport();
    const { result } = renderHook(() => useDialogue(true, report, fixture.api));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => { await result.current.requestReply(report, "saathi", true, "en"); });
    await act(async () => { await result.current.control({ operation: "language", language: "hi" }); });
    act(() => result.current.retry());
    await waitFor(() => expect(fixture.commands).toHaveLength(3));
    const requests = fixture.commands.filter(command => command.operation === "reply");
    expect(requests[1].key).not.toBe(requests[0].key); expect(requests[1].language).toBe("hi");
  });
});
