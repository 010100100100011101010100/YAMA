import { z } from "zod";
import { dialogueSchema, type Dialogue, type DialogueCommand } from "./dialogue";
import { ReportApiError } from "./report-api";

export type DialogueApi = { get: (reportId: string, signal: AbortSignal) => Promise<Dialogue>; change: (reportId: string, command: DialogueCommand) => Promise<Dialogue>;
  subscribe?: (reportId: string, signal: AbortSignal, receive: (dialogue: Dialogue) => void) => Promise<void> };
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
  async function subscribe(reportId: string, signal: AbortSignal, receive: (dialogue: Dialogue) => void) {
    const response = await fetch(`/api/reports/${reportId}/dialogue/stream`, { credentials: "same-origin", cache: "no-store", signal, headers: { Accept: "text/event-stream" } });
    if (!response.ok) {
      const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(await response.json());
      throw new ReportApiError(failure.success ? failure.data.error.code : "service_unavailable");
    }
    if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) throw new ReportApiError("invalid_response");
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffered = "";
    try {
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffered += decoder.decode(chunk.value, { stream: true });
        if (buffered.length > 1024 * 1024) throw new ReportApiError("invalid_response");
        let end: number;
        while ((end = buffered.indexOf("\n\n")) >= 0) {
          const event = buffered.slice(0, end); buffered = buffered.slice(end + 2);
          if (event.startsWith("event: unavailable")) throw new ReportApiError("service_unavailable");
          if (!event.startsWith("event: dialogue\ndata: ")) continue;
          const parsed = dialogueSchema.safeParse(JSON.parse(event.slice("event: dialogue\ndata: ".length)));
          if (!parsed.success || parsed.data.reportId !== reportId) throw new ReportApiError("invalid_response");
          receive(parsed.data);
        }
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  return { get: (reportId, signal) => request(reportId, undefined, signal), change: (reportId, command) => request(reportId, command), subscribe };
}
export const dialogueApi = createDialogueApi();
