import { z } from "zod";
import { actionPreviewSchema, type ActionPreview } from "./actions";
import { assistanceSchema, type Assistance } from "./assistance";
import { ReportApiError } from "./report-api";
export type ActionsApi = {
  assistance: (language: Assistance["language"], signal: AbortSignal) => Promise<Assistance>;
  preview: (reportId: string, signal: AbortSignal) => Promise<ActionPreview>;
  review: (reportId: string, revision: number, receipt: string) => Promise<ActionPreview>;
};
export function createActionsApi(): ActionsApi {
  async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, body?: unknown) {
    try {
      const reply = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
      const payload: unknown = await reply.json();
      if (!reply.ok) {
        const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
        throw new ReportApiError(failure.success ? failure.data.error.code : "service_unavailable");
      }
      const parsed = schema.safeParse(payload); if (!parsed.success) throw new ReportApiError("invalid_response"); return parsed.data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
      if (error instanceof ReportApiError) throw error;
      throw new ReportApiError("network_error");
    }
  }
  async function preview(reportId: string, signal?: AbortSignal, body?: unknown) {
    const draft = await request(`/api/reports/${reportId}/actions`, actionPreviewSchema, signal, body);
    if (draft.reportId !== reportId) throw new ReportApiError("invalid_response"); return draft;
  }
  return {
    async assistance(language, signal) {
      const guidance = await request(`/api/assistance?language=${language}`, assistanceSchema, signal);
      if (guidance.language !== language) throw new ReportApiError("invalid_response"); return guidance;
    },
    preview,
    async review(reportId, revision, receipt) {
      const draft = await preview(reportId, undefined, { expectedRevision: revision, receipt, acknowledged: true });
      if (draft.revision !== revision || draft.receipt !== receipt || draft.review.status !== "reviewed") throw new ReportApiError("invalid_response");
      return draft;
    },
  };
}
export const actionsApi = createActionsApi();
