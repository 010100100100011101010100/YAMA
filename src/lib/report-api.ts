import { chatSummarySchema,chatStatusSchema,type ChatSummary,type ChatStatus,type ChatResolution } from "./chat";
import { z } from "zod";
import type { Language } from "./demo-state";
import { extractionSchema } from "./evidence-extraction";
import { agentSourceSchema } from "./agent-task";
import { voiceSourceSchema } from "./voice-source";
import { connectionsSchema as connections } from "./connections";
import type { ConnectionsResult } from "./connections";
export type { ConnectionsResult } from "./connections";

const source = z.object({ messageId: z.uuid(), start: z.number().int().min(0), end: z.number().int().positive() });
const assertion = z.object({ id: z.uuid(), field: z.enum(["narrative", "amount", "item", "date", "pattern", "note"]),
  value: z.string().max(6000), originalValue: z.string().max(6000), included: z.boolean(), polarity: z.enum(["affirmed", "contradicted", "uncertain"]),
  origin: z.enum(["narration", "client_proposal", "evidence", "agent_proposal"]), verification: z.literal("not_verified"), source, agentSource: agentSourceSchema.optional() });
export const reportSchema = z.object({ _id: z.uuid(), synthetic: z.literal(true), language: z.enum(["en", "hi", "hinglish"]), revision: z.number().int().positive(),
  messages: z.array(z.object({ id: z.uuid(), text: z.string().max(6000), voiceSource: voiceSourceSchema.optional(), evidenceSource: z.object({ evidenceId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().max(120), extraction: extractionSchema.optional() }).optional() })).max(50), assertions: z.array(assertion).max(100),
  confirmation: z.object({ revision: z.number().int().positive(), kind: z.literal("user_confirmed") }).nullable() }).superRefine((saved, context) => {
  const messages = new Map(saved.messages.map(message => [message.id, message]));
  const invalid = messages.size !== saved.messages.length || new Set(saved.assertions.map(assertion => assertion.id)).size !== saved.assertions.length
    || saved.messages.some(message => message.evidenceSource?.extraction && message.evidenceSource.extraction.pages.at(-1)!.end !== message.text.length)
    || saved.confirmation !== null && saved.confirmation.revision !== saved.revision
    || saved.assertions.some(assertion => {
      const message = messages.get(assertion.source.messageId);
      return !message || assertion.source.start >= assertion.source.end || assertion.source.end > message.text.length
        || (assertion.origin === "agent_proposal") !== (assertion.agentSource !== undefined);
    });
  if (invalid) context.addIssue({ code: "custom", message: "Invalid report provenance or revision" });
});
const report = reportSchema;
export type SavedReport = z.infer<typeof reportSchema>;
export type Proposal = { field: SavedReport["assertions"][number]["field"]; value: string; source: z.infer<typeof source>; polarity?: "affirmed" | "contradicted" | "uncertain" };
export type ReportChange = { operation: "add_message"; text: string }
  | { operation: "accept_agent_proposals"; taskId: string; resultHash: string; proposalIds: string[] }
  | { operation: "review_evidence"; evidenceId: string; sha256: string; textSha256?: string }
  | { operation: "propose_assertions"; proposals: Proposal[] }
  | { operation: "correct_assertion"; assertionId: string; value?: string; included?: boolean; polarity?: "affirmed" | "contradicted" | "uncertain" };
export class ReportApiError extends Error {
  constructor(public code: string) { super(code); }
}
export type ReportApi = {
  list?: (signal:AbortSignal)=>Promise<ChatSummary[]>;
  chatStatus?: (id:string,signal:AbortSignal)=>Promise<ChatStatus>;
  setChatStatus?: (id:string,resolution:ChatResolution,version:number)=>Promise<ChatStatus>;
  restore: (signal: AbortSignal) => Promise<SavedReport | null>;
  create: (text: string, language: Language, key: string) => Promise<SavedReport>;
  get: (id: string, signal?: AbortSignal) => Promise<SavedReport>;
  revise: (id: string, revision: number, change: ReportChange) => Promise<SavedReport>;
  confirm: (id: string, revision: number) => Promise<SavedReport>;
  connections: (id: string, signal: AbortSignal) => Promise<ConnectionsResult>;
};
function decode<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ReportApiError("invalid_response");
  return parsed.data;
}
export function createReportApi(): ReportApi {
  async function request(path: string, method = "GET", body?: unknown, signal?: AbortSignal, headers: Record<string, string> = {}) {
    try {
      const result = await fetch(path, { method, credentials: "same-origin", cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(path.endsWith("/connections") ? 40_000 : 10_000)]) : AbortSignal.timeout(path.endsWith("/connections") ? 40_000 : 10_000),
        headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const payload: unknown = await result.json();
      if (!result.ok) {
        const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
        throw new ReportApiError(error.success ? error.data.error.code : "service_unavailable");
      }
      return payload;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
      if (error instanceof ReportApiError) throw error;
      throw new ReportApiError("network_error");
    }
  }
  let connecting: Promise<void> | null = null;
  function session() {
    // React Strict Mode may restart restoration. Share sign-in, rather than creating two anonymous accounts.
    connecting ??= (async () => {
      const current = await request("/api/auth/get-session");
      if (!current) await request("/api/auth/sign-in/anonymous", "POST", {});
    })().finally(() => { connecting = null; });
    return connecting;
  }
  const readReport = async (path: string, method = "GET", body?: unknown, signal?: AbortSignal, headers?: Record<string, string>) =>
    decode(z.object({ report }), await request(path, method, body, signal, headers)).report;
  return {
    async list(signal) {await session();return decode(z.object({reports:z.array(chatSummarySchema).max(50)}),await request("/api/reports","GET",undefined,signal)).reports;},
    async chatStatus(id,signal) {const saved=decode(z.object({status:chatStatusSchema}),await request(`/api/reports/${id}/chat-status`,"GET",undefined,signal)).status;if(saved.reportId!==id)throw new ReportApiError("invalid_response");return saved;},
    async setChatStatus(id,resolution,version) {const saved=decode(z.object({status:chatStatusSchema}),await request(`/api/reports/${id}/chat-status`,"PATCH",{resolution,expectedVersion:version})).status;if(saved.reportId!==id)throw new ReportApiError("invalid_response");return saved;},
    async restore(signal) {
      await session();
      if (signal.aborted) throw new DOMException("Canceled", "AbortError");
      const latest = decode(z.object({ reports: z.array(z.object({ _id: z.uuid() })).max(50) }), await request("/api/reports", "GET", undefined, signal)).reports[0];
      if (!latest) return null;
      const saved = await readReport(`/api/reports/${latest._id}`, "GET", undefined, signal);
      if (saved._id !== latest._id) throw new ReportApiError("invalid_response");
      return saved;
    },
    create: (text, language, key) => readReport("/api/reports", "POST", { synthetic: true, language, narrative: text }, undefined, { "Idempotency-Key": key }),
    async get(id, signal) { const saved = await readReport(`/api/reports/${id}`, "GET", undefined, signal); if (saved._id !== id) throw new ReportApiError("invalid_response"); return saved; },
    revise: (id, revision, change) => change.operation === "accept_agent_proposals"
      ? readReport(`/api/reports/${id}/agent-tasks/${change.taskId}/accept`, "POST", { expectedRevision: revision, acknowledged: true, resultHash: change.resultHash, proposalIds: change.proposalIds })
      : change.operation === "review_evidence"
      ? readReport(`/api/reports/${id}/evidence/${change.evidenceId}/review`, "POST", { expectedRevision: revision, sha256: change.sha256, textSha256: change.textSha256, acknowledged: true })
      : readReport(`/api/reports/${id}`, "PATCH", { ...change, expectedRevision: revision }),
    confirm: (id, revision) => readReport(`/api/reports/${id}/confirm`, "POST", { expectedRevision: revision, acknowledged: true }),
    async connections(id, signal) {
      const result = decode(connections, await request(`/api/reports/${id}/connections`, "GET", undefined, signal));
      if (result.reportId !== id) throw new ReportApiError("invalid_response");
      return result;
    },
  };
}
export const reportApi = createReportApi();
