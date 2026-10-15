import { describe, expect, it, vi } from "vitest";
import { ReportSession, waitForConnections } from "@/lib/report-session";
import { ReportApiError } from "@/lib/report-api";
import { assertionId, confirmedReport, connections, reportGateway as api, savedReport } from "./report-fixtures";
import { agentTask } from "./agent-fixtures";
import { AGENT_ADAPTER } from "@/lib/agent-task";
describe("persistent report commands", () => {
  it("recovers committed agent acceptance after a lost response without adding it twice", async () => {
    const gateway = api(), original = confirmedReport(), task = agentTask(), proposal = task.result!.proposals[0];
    vi.mocked(gateway.restore).mockResolvedValue(original);
    vi.mocked(gateway.revise).mockRejectedValueOnce(new ReportApiError("network_error"));
    const accepted = { ...savedReport(2), assertions: [...original.assertions, { ...original.assertions[0], id: crypto.randomUUID(), field: proposal.field,
      value: proposal.value, originalValue: proposal.value, source: proposal.source, origin: "agent_proposal" as const,
      agentSource: { taskId: task.id, agent: "saathi" as const, provider: AGENT_ADAPTER.provider, model: AGENT_ADAPTER.model, version: AGENT_ADAPTER.version } }] };
    vi.mocked(gateway.get).mockResolvedValue(accepted);
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal);
    await session.revise({ operation: "accept_agent_proposals", taskId: task.id, resultHash: task.resultHash!, proposalIds: [proposal.id] });
    expect(gateway.revise).toHaveBeenCalledOnce(); expect(session.report?.revision).toBe(2); expect(session.report?.confirmation).toBeNull();
  });
  it("restores owned data without rewriting original wording", async () => {
    const gateway = api(); vi.mocked(gateway.restore).mockResolvedValue(savedReport());
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal);
    expect(session.report?.messages[0].text).toBe("  काल्पनिक घटना।\nसामान नहीं आया।  ");
  });
  it("reuses the creation key after a lost response", async () => {
    const gateway = api(); vi.mocked(gateway.create).mockRejectedValueOnce(new ReportApiError("network_error"));
    const session = new ReportSession(gateway);
    await expect(session.send("Fictional note", "en")).rejects.toThrow();
    await session.send("Fictional note", "en");
    expect(vi.mocked(gateway.create).mock.calls[0][2]).toBe(vi.mocked(gateway.create).mock.calls[1][2]);
  });
  it("reconciles a committed correction after a lost response without submitting twice", async () => {
    const gateway = api(); const initial = savedReport();
    vi.mocked(gateway.restore).mockResolvedValue(initial);
    vi.mocked(gateway.revise).mockRejectedValueOnce(new ReportApiError("network_error"));
    const corrected = { ...savedReport(2), assertions: [{ ...initial.assertions[0], value: "Corrected" }] };
    vi.mocked(gateway.get).mockResolvedValue(corrected);
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal);
    await session.revise({ operation: "correct_assertion", assertionId, value: "Corrected" });
    expect(gateway.revise).toHaveBeenCalledOnce(); expect(session.report?.revision).toBe(2);
    expect(session.report?.assertions[0].originalValue).toBe(initial.assertions[0].originalValue);
  });
  it("requires review after another tab changes the revision", async () => {
    const gateway = api(); vi.mocked(gateway.restore).mockResolvedValue(savedReport());
    vi.mocked(gateway.revise).mockRejectedValueOnce(new ReportApiError("revision_conflict"));
    vi.mocked(gateway.get).mockResolvedValue(savedReport(3));
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal);
    await expect(session.revise({ operation: "correct_assertion", assertionId, value: "My edit" })).rejects.toThrow("revision_conflict");
    expect(session.report?.revision).toBe(3); expect(gateway.revise).toHaveBeenCalledOnce();
  });
  it("does not silently create another session after authentication expires", async () => {
    const gateway = api(); vi.mocked(gateway.restore).mockResolvedValue(savedReport());
    vi.mocked(gateway.confirm).mockRejectedValue(new ReportApiError("authentication_required"));
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal);
    await expect(session.confirm()).rejects.toThrow("authentication_required");
    expect(gateway.restore).toHaveBeenCalledOnce(); expect(gateway.create).not.toHaveBeenCalled();
  });
  it("does not revise an unchanged correction or invalidate confirmation", async () => {
    const gateway = api(); vi.mocked(gateway.restore).mockResolvedValue(confirmedReport());
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal);
    await session.revise({ operation: "correct_assertion", assertionId, value: savedReport().assertions[0].value });
    expect(gateway.revise).not.toHaveBeenCalled(); expect(session.report?.confirmation?.revision).toBe(1);
  });
  it("recovers a committed appended message without appending it again", async () => {
    const gateway = api(); const original = savedReport(); vi.mocked(gateway.restore).mockResolvedValue(original);
    const updated = { ...savedReport(2), messages: [...original.messages, { id: crypto.randomUUID(), text: "Next note" }] };
    vi.mocked(gateway.revise).mockRejectedValueOnce(new ReportApiError("network_error")); vi.mocked(gateway.get).mockResolvedValue(updated);
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal); await session.send("Next note", "en");
    expect(gateway.revise).toHaveBeenCalledOnce(); expect(session.report?.messages).toHaveLength(2);
  });
  it("recovers a reviewed file after a lost response using its provenance", async () => {
    const gateway = api(); const original = confirmedReport(); vi.mocked(gateway.restore).mockResolvedValue(original);
    const fileSource = { evidenceId: crypto.randomUUID(), sha256: "a".repeat(64), name: "record.txt" };
    const updated = { ...savedReport(2), messages: [...original.messages, { id: crypto.randomUUID(), text: "Fictional record", evidenceSource: fileSource }] };
    vi.mocked(gateway.revise).mockRejectedValueOnce(new ReportApiError("network_error")); vi.mocked(gateway.get).mockResolvedValue(updated);
    const session = new ReportSession(gateway); await session.restore(new AbortController().signal);
    await session.revise({ operation: "review_evidence", evidenceId: fileSource.evidenceId, sha256: fileSource.sha256 });
    expect(gateway.revise).toHaveBeenCalledOnce(); expect(session.report?.confirmation).toBeNull();
    expect(session.report?.messages.at(-1)?.evidenceSource).toEqual(fileSource);
  });
  it("waits for actual ready graph output", async () => {
    vi.useFakeTimers();
    try {
      const gateway = api(); vi.mocked(gateway.connections).mockResolvedValueOnce(connections("pending")).mockResolvedValueOnce(connections());
      const work = waitForConnections(gateway, confirmedReport(), new AbortController().signal);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(work).resolves.toEqual(connections()); expect(gateway.connections).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it("rejects a graph response for a different revision", async () => {
    const gateway = api(); vi.mocked(gateway.connections).mockResolvedValue({ ...connections(), revision: 2 });
    await expect(waitForConnections(gateway, confirmedReport(), new AbortController().signal)).rejects.toThrow("revision_conflict");
  });
  it("stops polling when canceled while pending", async () => {
    const gateway = api(); vi.mocked(gateway.connections).mockResolvedValue(connections("pending"));
    const controller = new AbortController(); const work = waitForConnections(gateway, confirmedReport(), controller.signal);
    const rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve(); controller.abort(); await rejected;
    expect(gateway.connections).toHaveBeenCalledOnce();
  });
});
