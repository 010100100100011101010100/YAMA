import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvidenceApi } from "@/lib/evidence-api";
import { createReportApi } from "@/lib/report-api";
import { reportId, savedReport } from "./report-fixtures";

afterEach(() => vi.unstubAllGlobals());
const evidenceId = "00000000-0000-4000-8000-000000000004", sha256 = "a".repeat(64);
const evidence = { id: evidenceId, reportId, name: "रिकॉर्ड.txt", size: 30, sha256, status: "ready", errorCode: null, reviewed: false };
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
describe("evidence HTTP adapter", () => {
  it("uploads raw bytes with cookies, an encoded filename and a reusable key", async () => {
    const fetcher = vi.fn(async () => json({ evidence })); vi.stubGlobal("fetch", fetcher);
    const file = new File(["काल्पनिक रिकॉर्ड"], evidence.name, { type: "text/plain" });
    await createEvidenceApi().upload(reportId, file, "upload-key");
    const [path, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/reports/${reportId}/evidence`); expect(request.body).toBe(file);
    expect(request).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent(file.name), "Idempotency-Key": "upload-key" } });
  });
  it("refuses mismatched file and report responses", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ evidence: [{ ...evidence, reportId: crypto.randomUUID() }] }))
      .mockResolvedValueOnce(json({ source: { evidenceId: crypto.randomUUID(), name: evidence.name, sha256, text: "Source" } }));
    vi.stubGlobal("fetch", fetcher); const api = createEvidenceApi();
    await expect(api.list(reportId, new AbortController().signal)).rejects.toThrow("invalid_response");
    await expect(api.source(reportId, evidenceId)).rejects.toThrow("invalid_response");
  });
  it("does not reconnect an expired session while reading a file", async () => {
    const fetcher = vi.fn(async () => json({ error: { code: "authentication_required" } }, 401)); vi.stubGlobal("fetch", fetcher);
    await expect(createEvidenceApi().source(reportId, evidenceId)).rejects.toThrow("authentication_required"); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("uses the dedicated review endpoint with the current revision and acknowledgement", async () => {
    const fetcher = vi.fn(async () => json({ report: savedReport(2) })); vi.stubGlobal("fetch", fetcher);
    await createReportApi().revise(reportId, 1, { operation: "review_evidence", evidenceId, sha256 });
    const [path, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/reports/${reportId}/evidence/${evidenceId}/review`);
    expect(request.method).toBe("POST"); expect(JSON.parse(String(request.body))).toEqual({ expectedRevision: 1, acknowledged: true, sha256 });
  });
});
