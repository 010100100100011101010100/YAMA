import { afterEach, describe, expect, it, vi } from "vitest";
import { createActionsApi } from "@/lib/actions-api";
import type { ActionPreview } from "@/lib/actions";
import { reportId } from "./report-fixtures";
const preview: ActionPreview = { recipe: "private-actions-v1", reportId, revision: 1, language: "en", confirmation: "unconfirmed", verification: "not_independently_verified", submitted: false,
  summary: [], files: [], omittedAssertionIds: [], receipt: "a".repeat(64), review: { status: "reviewed", reviewedAt: "2026-10-11T10:00:00Z" } };
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());
describe("private action HTTP adapter", () => {
  it("sends only the revision, frozen receipt and acknowledgement with same-origin credentials", async () => {
    const fetcher = vi.fn(async () => reply(preview)); vi.stubGlobal("fetch", fetcher);
    await createActionsApi().review(reportId, 1, preview.receipt);
    const [path, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/reports/${reportId}/actions`); expect(request).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(String(request.body))).toEqual({ expectedRevision: 1, receipt: preview.receipt, acknowledged: true });
  });
  it("rejects mismatched receipts, accounts, false filing claims and unreviewed success responses", async () => {
    for (const invalid of [{ ...preview, reportId: crypto.randomUUID() }, { ...preview, receipt: "b".repeat(64) }, { ...preview, submitted: true }, { ...preview, review: { status: "unreviewed", reviewedAt: null } }]) {
      vi.stubGlobal("fetch", vi.fn(async () => reply(invalid)));
      await expect(createActionsApi().review(reportId, 1, preview.receipt)).rejects.toThrow("invalid_response");
    }
  });
});
