import { z } from "zod";
import { dialogueSchema, type Dialogue, type DialogueCommand } from "./dialogue";
import { ReportApiError } from "./report-api";

export type DialogueApi = { get: (reportId: string, signal: AbortSignal) => Promise<Dialogue>; change: (reportId: string, command: DialogueCommand) => Promise<Dialogue> };
export function createDialogueApi(): DialogueApi {
  async function request(reportId: string, command?: DialogueCommand, signal?: AbortSignal): Promise<Dialogue> {
    try {
      const response = await fetch(`/api/reports/${reportId}/dialogue`, { method: command ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json" }, body: command ? JSON.stringify(command) : undefined });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
        throw new ReportApiError(failure.success ? failure.data.error.code : "service_unavailable");
      }
      const parsed = z.strictObject({ dialogue: dialogueSchema }).safeParse(payload);
      if (!parsed.success || parsed.data.dialogue.reportId !== reportId) throw new ReportApiError("invalid_response");
      return parsed.data.dialogue;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
      if (error instanceof ReportApiError) throw error;
      throw new ReportApiError("network_error");
    }
  }
  return { get: (reportId, signal) => request(reportId, undefined, signal), change: (reportId, command) => request(reportId, command) };
}
export const dialogueApi = createDialogueApi();
