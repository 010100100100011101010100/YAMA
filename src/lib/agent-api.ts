import { z } from "zod";
import { agentTaskSchema, type AgentTask } from "./agent-task";
import { ReportApiError } from "./report-api";

export type AgentApi = {
  list: (reportId: string, signal: AbortSignal) => Promise<AgentTask[]>;
  start: (reportId: string, revision: number, key: string) => Promise<AgentTask>;
  cancel: (reportId: string, taskId: string) => Promise<AgentTask>;
};
export function createAgentApi(): AgentApi {
  const path = (report: string) => `/api/reports/${report}/agent-tasks`;
  async function request<T>(route: string, schema: z.ZodType<T>, method = "GET", body?: unknown, signal?: AbortSignal, headers: Record<string, string> = {}) {
    try {
      const response = await fetch(route, { method, credentials: "same-origin", cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
        throw new ReportApiError(failure.success ? failure.data.error.code : "service_unavailable");
      }
      const decoded = schema.safeParse(payload);
      if (!decoded.success) throw new ReportApiError("invalid_response"); return decoded.data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
      if (error instanceof ReportApiError) throw error;
      throw new ReportApiError("network_error");
    }
  }
  return {
    async list(reportId, signal) {
      const tasks = (await request(path(reportId), z.object({ tasks: z.array(agentTaskSchema).max(20) }), "GET", undefined, signal)).tasks;
      if (tasks.some(task => task.reportId !== reportId)) throw new ReportApiError("invalid_response"); return tasks;
    },
    async start(reportId, revision, key) {
      const task = (await request(path(reportId), z.object({ task: agentTaskSchema }), "POST", { expectedRevision: revision }, undefined, { "Idempotency-Key": key })).task;
      if (task.reportId !== reportId || task.revision !== revision) throw new ReportApiError("invalid_response"); return task;
    },
    async cancel(reportId, taskId) {
      const task = (await request(`${path(reportId)}/${taskId}/cancel`, z.object({ task: agentTaskSchema }), "POST")).task;
      if (task.reportId !== reportId || task.id !== taskId) throw new ReportApiError("invalid_response"); return task;
    },
  };
}
export const agentApi = createAgentApi();
