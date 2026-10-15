import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportApi } from "@/lib/report-api";
import { connections, reportId, savedReport } from "./report-fixtures";
import { agentTask } from "./agent-fixtures";

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
describe("report HTTP adapter", () => {
  it("accepts only stored proposal IDs through the receipt-bound endpoint", async () => {
    const fetcher = vi.fn(async () => json({ report: savedReport(2) })); vi.stubGlobal("fetch", fetcher);
    const task = agentTask();
    await createReportApi().revise(reportId, 1, { operation: "accept_agent_proposals", taskId: task.id, resultHash: task.resultHash!, proposalIds: [task.result!.proposals[0].id] });
    const [route, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(route).toBe(`/api/reports/${reportId}/agent-tasks/${task.id}/accept`);
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({ expectedRevision: 1, acknowledged: true, resultHash: task.resultHash, proposalIds: [task.result!.proposals[0].id] });
  });
  it("shares anonymous sign-in during concurrent restoration", async () => {
    const fetcher = vi.fn(async (path: string) => path === "/api/auth/get-session" ? json(null) : path === "/api/reports" ? json({ reports: [] }) : json({ user: {} }));
    vi.stubGlobal("fetch", fetcher); const gateway = createReportApi();
    await Promise.all([gateway.restore(new AbortController().signal), gateway.restore(new AbortController().signal)]);
    expect(fetcher.mock.calls.filter(([path]) => path === "/api/auth/sign-in/anonymous")).toHaveLength(1);
  });
  it("sends exact narration and a creation key through same-origin cookies", async () => {
    const fetcher = vi.fn(async () => json({ report: savedReport() })); vi.stubGlobal("fetch", fetcher);
    const words = "  कल्पना की घटना।\n₹8,000  "; await createReportApi().create(words, "hi", "creation-key");
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1]).toMatchObject({ credentials: "same-origin", cache: "no-store", headers: { "Idempotency-Key": "creation-key" } });
    expect(JSON.parse(String(call[1].body))).toEqual({ narrative: words, language: "hi", synthetic: true });
  });
  it("rejects invalid provenance and wrong-report responses", async () => {
    const invalid = savedReport(); invalid.assertions[0].source.end = 6000;
    const fetcher = vi.fn().mockResolvedValueOnce(json({ report: invalid })).mockResolvedValueOnce(json({ report: { ...savedReport(), _id: crypto.randomUUID() } }));
    vi.stubGlobal("fetch", fetcher); const gateway = createReportApi();
    await expect(gateway.get(reportId)).rejects.toThrow("invalid_response");
    await expect(gateway.get(reportId)).rejects.toThrow("invalid_response");
  });
  it("preserves authentication failures without retrying sign-in", async () => {
    const fetcher = vi.fn(async () => json({ error: { code: "authentication_required" } }, 401)); vi.stubGlobal("fetch", fetcher);
    await expect(createReportApi().confirm(reportId, 1)).rejects.toThrow("authentication_required"); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("accepts pending responses but rejects graph output for another report", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(connections("pending"), 202)).mockResolvedValueOnce(json({ ...connections(), reportId: crypto.randomUUID() }));
    vi.stubGlobal("fetch", fetcher); const gateway = createReportApi();
    await expect(gateway.connections(reportId, new AbortController().signal)).resolves.toMatchObject({ status: "pending" });
    await expect(gateway.connections(reportId, new AbortController().signal)).rejects.toThrow("invalid_response");
  });
});
