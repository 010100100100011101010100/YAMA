import { z } from "zod";
import { ReportApiError } from "./report-api";
import { extractionSchema } from "./evidence-extraction";
import { uploadFormat } from "./evidence-format";

const evidence = z.object({ id: z.uuid(), reportId: z.uuid(), name: z.string().max(120), size: z.number().int().min(1).max(5242880),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["stored", "queued", "processing", "ready", "failed", "canceled"]),
  format: z.enum(["text", "pdf", "png", "jpeg"]).optional(), attempts: z.number().int().min(0).optional(), errorCode: z.string().nullable(), reviewed: z.boolean() });
const source = z.object({ evidenceId: z.uuid(), name: z.string().max(120), sha256: z.string().regex(/^[a-f0-9]{64}$/), text: z.string().min(1).max(6000), extraction: extractionSchema.optional() })
  .refine(value => !value.extraction || value.extraction.pages.at(-1)!.end === value.text.length);
export type SavedEvidence = z.infer<typeof evidence>;
export type EvidenceSource = z.infer<typeof source>;
export type EvidenceApi = {
  list: (reportId: string, signal: AbortSignal) => Promise<SavedEvidence[]>;
  upload: (reportId: string, file: File, key: string) => Promise<SavedEvidence>;
  extract: (reportId: string, id: string) => Promise<SavedEvidence>;
  cancel: (reportId: string, id: string) => Promise<SavedEvidence>;
  source: (reportId: string, id: string) => Promise<EvidenceSource>;
  remove: (reportId: string, id: string) => Promise<void>;
};
export function createEvidenceApi(): EvidenceApi {
  async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: BodyInit, headers: Record<string, string> = {}, signal?: AbortSignal) {
    try {
      const reply = await fetch(path, { method, body, headers, credentials: "same-origin", cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
      const payload: unknown = await reply.json();
      if (!reply.ok) {
        const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
        throw new ReportApiError(failure.success ? failure.data.error.code : "service_unavailable");
      }
      const parsed = schema.safeParse(payload); if (!parsed.success) throw new ReportApiError("invalid_response"); return parsed.data;
    } catch (failure) {
      if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
      if (failure instanceof ReportApiError) throw failure;
      throw new ReportApiError("network_error");
    }
  }
  const path = (reportId: string, id?: string) => `/api/reports/${reportId}/evidence${id ? `/${id}` : ""}`;
  async function file(reportId: string, id: string | undefined, route: string, method: string, body?: BodyInit, headers?: Record<string, string>) {
    const saved = (await request(route, z.object({ evidence }), method, body, headers)).evidence;
    if (saved.reportId !== reportId || id && saved.id !== id) throw new ReportApiError("invalid_response"); return saved;
  }
  return {
    async list(reportId, signal) {
      const saved = (await request(path(reportId), z.object({ evidence: z.array(evidence).max(20) }), "GET", undefined, {}, signal)).evidence;
      if (saved.some(file => file.reportId !== reportId)) throw new ReportApiError("invalid_response"); return saved;
    },
    upload: (reportId, upload, key) => file(reportId, undefined, path(reportId), "POST", upload,
      { "Content-Type": upload.type || uploadFormat(upload.name)?.mime || "application/octet-stream", "X-File-Name": encodeURIComponent(upload.name), "Idempotency-Key": key }),
    extract: (reportId, id) => file(reportId, id, `${path(reportId, id)}/extract`, "POST"),
    cancel: (reportId, id) => file(reportId, id, `${path(reportId, id)}/cancel`, "POST"),
    async source(reportId, id) {
      const saved = (await request(`${path(reportId, id)}/source`, z.object({ source }))).source;
      if (saved.evidenceId !== id) throw new ReportApiError("invalid_response"); return saved;
    },
    async remove(reportId, id) { await request(path(reportId, id), z.object({ removed: z.literal(true) }), "DELETE"); },
  };
}
export const evidenceApi = createEvidenceApi();
