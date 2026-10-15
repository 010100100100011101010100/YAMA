import type { ConnectionsResult } from "./report-api";

export type AgentId = "saathi" | "drishti" | "disha";
export type Stage = "story" | "review" | "connections" | "steps";
export type Language = "en" | "hi" | "hinglish";
export type MessageKey = "welcome" | "noteReply" | "saathiBridge" | "dishaBridge" | "drishtiBridge";
export type Message = { id: string; agent: AgentId | "you"; text: string; key?: MessageKey;
  voiceSource?: import("./report-api").SavedReport["messages"][number]["voiceSource"];
  dialogue?: { handoff?:import("./dialogue").DialogueReply["handoff"]; revision: number; older: boolean; provider: "fixture" | "openai"; language: Language; connectionReceipt?: import("./connections").ConnectionReceipt };
  evidenceSource?: { evidenceId: string; sha256: string; name: string; extraction?: import("./evidence-extraction").EvidenceExtraction } };
export type Detail = { id: string; value: string; originalValue: string; sourceId: string; included: boolean;
  field?: "narrative" | "amount" | "item" | "date" | "pattern" | "note"; polarity?: "affirmed" | "contradicted" | "uncertain";
  agentSource?: import("./report-api").SavedReport["assertions"][number]["agentSource"] };
export type Evidence = { id: string; name: string; size: number; type: string };
export type DemoTask = { id: string; revision: number; status: "running" | "ready" | "failed" | "stale" | "canceled" };
export type DemoState = {
  stage: Stage;
  language: Language;
  activeAgent: AgentId;
  mode: "text" | "voice";
  voice: "off" | "playing" | "paused" | "interrupted";
  automaticHandoffs: boolean;
  messages: Message[];
  details: Detail[];
  evidence: Evidence[];
  revision: number;
  confirmedRevision: number | null;
  example: boolean;
  backend: boolean;
  reportId: string | null;
  connections: ConnectionsResult | null;
  task: DemoTask | null;
  notice: "" | "reviewNeeded" | "acknowledgeNeeded" | "confirmed" | "changed" | "handoff" | "taskReady" | "taskFailed" | "taskCanceled";
};

export type DemoAction =
  | { type: "accept-proposals"; taskId: string; resultHash: string; proposalIds: string[] }
  | { type: "load-example" }
  | { type: "navigate"; stage: Stage }
  | { type: "language"; language: Language }
  | { type: "select-agent"; agent: AgentId }
  | { type: "automatic-handoffs"; enabled: boolean }
  | { type: "mode"; mode: "text" | "voice" }
  | { type: "voice"; status: DemoState["voice"] }
  | { type: "send-message"; id: string; text: string; recipient?: AgentId }
  | { type: "edit-detail"; id: string; value: string }
  | { type: "include-detail"; id: string; included: boolean }
  | { type: "detail-polarity"; id: string; polarity: "affirmed" | "contradicted" | "uncertain" }
  | { type: "review-evidence"; id: string; sha256: string; textSha256?: string }
  | { type: "sync-report"; reportId: string; revision: number; details: Detail[]; messages: Message[]; example: boolean; confirmedRevision: number | null; language?: Language; restored?: boolean }
  | { type: "sync-dialogue"; agent: AgentId; automatic: boolean; language: Language }
  | { type: "unsynced-report" }
  | { type: "resume-task"; id: string }
  | { type: "add-evidence"; evidence: Evidence }
  | { type: "remove-evidence"; id: string }
  | { type: "confirm"; acknowledged: boolean }
  | { type: "start-task"; id: string }
  | { type: "finish-task"; id: string; revision: number; outcome: "ready" | "failed"; result?: ConnectionsResult }
  | { type: "cancel-task" }
  | { type: "show-comparison" };

const WELCOME = "Start with what you remember. We can put the details in order together.";
export const EXAMPLE_STORY = "I paid ₹8,000 for a used phone. The seller promised to deliver it, then stopped replying. I don’t remember the exact date.";

export function createDemoState(): DemoState {
  return {
    stage: "story", language: "en", activeAgent: "saathi", mode: "text", voice: "off", automaticHandoffs: true,
    messages: [{ id: "welcome", agent: "saathi", text: WELCOME, key: "welcome" }],
    details: [], evidence: [], revision: 0, confirmedRevision: null, example: false, task: null, notice: "", backend: false, reportId: null, connections: null,
  };
}

export function hasCurrentConfirmation(state: DemoState) {
  return state.confirmedRevision !== null && state.confirmedRevision === state.revision;
}

// The authored comparison has no inference engine. Do not reuse its claims when
// a person changes or excludes the narrative that those claims describe.
export function matchesComparisonFixture(state: DemoState) {
  const expected = { story: EXAMPLE_STORY, item: "Used phone", date: "Not remembered" };
  return state.example && Object.entries(expected).every(([id, value]) => state.details.some(detail => detail.id === id && detail.included && detail.value === value));
}

function invalidate(state: DemoState): DemoState {
  return {
    ...state, revision: state.revision + 1, confirmedRevision: null, notice: "changed",
    task: state.task ? { ...state.task, status: "stale" } : null,
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "sync-report": {
      const sameRevision = state.reportId === action.reportId && state.revision === action.revision && action.confirmedRevision === action.revision;
      const base = action.restored || state.reportId && state.reportId !== action.reportId ? state.messages.filter(message => message.id === "welcome") : state.messages;
      const savedIds = new Set(action.messages.map(message => message.id));
      let messages = base.filter(message => message.agent !== "you" || savedIds.has(message.id));
      const newMessages = action.messages.filter(message => !messages.some(old => old.id === message.id));
      messages = [...messages.map(message => action.messages.find(saved => saved.id === message.id) ?? message), ...newMessages];
      return { ...state, backend: true, reportId: action.reportId, revision: action.revision, details: action.details, messages,
        example: action.example, confirmedRevision: action.confirmedRevision, language: action.language ?? state.language,
        task: sameRevision ? state.task : state.task ? { ...state.task, status: "stale" } : null,
        connections: sameRevision ? state.connections : null, notice: action.restored ? "" : action.confirmedRevision === action.revision ? "confirmed" : "changed" };
    }
    case "sync-dialogue": return { ...state, activeAgent: action.agent, automaticHandoffs: action.automatic, language: action.language };
    case "unsynced-report": return { ...state, confirmedRevision: null, connections: null, task: state.task ? { ...state.task, status: "stale" } : null };
    case "resume-task": return hasCurrentConfirmation(state) ? { ...state, task: { id: action.id, revision: state.revision, status: "running" } } : state;
    case "load-example": {
      // Loading is explicit and additive; never discard a person's typed account.
      if (state.example) return state;
      const detail = (id: string, value: string): Detail => ({ id, value, originalValue: value, sourceId: "example-story", included: true });
      return {
        ...invalidate(state), example: true,
        messages: [...state.messages, { id: "example-story", agent: "you", text: EXAMPLE_STORY }],
        details: [...state.details, detail("story", EXAMPLE_STORY), detail("amount", "₹18,000"), detail("item", "Used phone"), detail("date", "Not remembered")],
      };
    }
    case "navigate":
      if (action.stage === "connections" && !hasCurrentConfirmation(state)) return { ...state, stage: "review", notice: "reviewNeeded" };
      if (!state.backend && action.stage === "steps" && state.automaticHandoffs && state.activeAgent !== "disha") return {
        ...state, stage: "steps", activeAgent: "disha", voice: state.mode === "voice" ? "paused" : "off", notice: "handoff",
      };
      return { ...state, stage: action.stage };
    case "language": return { ...state, language: action.language };
    case "select-agent": return { ...state, activeAgent: action.agent, voice: state.mode === "voice" ? "paused" : "off", notice: "handoff" };
    case "automatic-handoffs": return { ...state, automaticHandoffs: action.enabled };
    case "mode": return { ...state, mode: action.mode, voice: "off" };
    case "voice": return state.mode === "voice" ? { ...state, voice: action.status } : state;
    case "send-message": {
      const text = action.text.trim();
      if (!text || state.messages.some(message => message.id === action.id)) return state;
      return {
        ...invalidate(state), activeAgent: action.recipient ?? state.activeAgent, voice: state.mode === "voice" ? "interrupted" : "off",
        messages: [...state.messages, { id: action.id, agent: "you", text }, { id: `${action.id}-reply`, agent: action.recipient ?? state.activeAgent, text: "Your note is in the demo account. Review it in your own words; no model has extracted new facts.", key: "noteReply" }],
        details: [...state.details, { id: action.id, value: text, originalValue: text, sourceId: action.id, included: true }],
      };
    }
    case "edit-detail": {
      const detail = state.details.find(item => item.id === action.id);
      const value = action.value.trim();
      if (!detail || !value || value === detail.value) return state;
      return { ...invalidate(state), details: state.details.map(item => item.id === action.id ? { ...item, value } : item) };
    }
    case "include-detail":
      if (!state.details.some(item => item.id === action.id && item.included !== action.included)) return state;
      return { ...invalidate(state), details: state.details.map(item => item.id === action.id ? { ...item, included: action.included } : item) };
    case "detail-polarity": return { ...invalidate(state), details: state.details.map(item => item.id === action.id ? { ...item, polarity: action.polarity } : item) };
    // Only the persistence adapter can import an owned file with server provenance.
    case "review-evidence": case "accept-proposals": return state;
    case "add-evidence":
      return { ...(state.backend ? state : invalidate(state)), evidence: [...state.evidence, action.evidence] };
    case "remove-evidence":
      return { ...(state.backend ? state : invalidate(state)), evidence: state.evidence.filter(item => item.id !== action.id) };
    case "confirm":
      if (!action.acknowledged || !state.details.some(detail => detail.included && detail.value.trim())) return { ...state, notice: "acknowledgeNeeded" };
      return { ...state, confirmedRevision: state.revision, notice: "confirmed" };
    case "start-task": {
      if (!hasCurrentConfirmation(state)) return state;
      const handoff = !state.backend && state.automaticHandoffs && state.activeAgent !== "disha";
      return {
        ...state, task: { id: action.id, revision: state.revision, status: "running" },
        activeAgent: handoff ? "disha" : state.activeAgent,
        voice: handoff && state.mode === "voice" ? "paused" : state.voice,
        notice: handoff ? "handoff" : state.notice,
        messages: handoff ? [...state.messages,
          { id: `${action.id}-bridge`, agent: state.activeAgent, text: "Drishti will look at the demo comparison. While that runs, Disha can help with next steps.", key: "saathiBridge" },
          { id: `${action.id}-disha`, agent: "disha", text: "I’m Disha. First, keep the original messages and payment record. Your own report stays available while Drishti works.", key: "dishaBridge" },
        ] : state.messages,
      };
    }
    case "finish-task":
      if (!state.task || state.task.id !== action.id || state.task.status !== "running" || state.revision !== action.revision || !hasCurrentConfirmation(state)) return state;
      if (state.backend && action.outcome === "ready" && (!action.result || action.result.reportId !== state.reportId || action.result.revision !== state.revision)) return state;
      return { ...state, connections: action.result ?? null, task: { ...state.task, status: action.outcome }, notice: action.outcome === "ready" ? "taskReady" : "taskFailed" };
    case "cancel-task":
      return state.task?.status === "running" ? { ...state, task: { ...state.task, status: "canceled" }, notice: "taskCanceled" } : state;
    case "show-comparison":
      if (!hasCurrentConfirmation(state) || state.task?.status !== "ready" || state.task.revision !== state.revision) return state;
      return {
        ...state, stage: "connections", activeAgent: !state.backend && state.automaticHandoffs ? "drishti" : state.activeAgent,
        voice: !state.backend && state.automaticHandoffs && state.mode === "voice" ? "paused" : state.voice,
        messages: state.backend || state.messages.some(message => message.id === `${state.task!.id}-drishti`) ? state.messages : [...state.messages, {
          id: `${state.task.id}-drishti`, agent: "drishti", text: "I’m Drishti. This example illustrates a similar sequence. It does not establish a shared identity. Let’s look at the sources and differences.", key: "drishtiBridge",
        }], notice: "handoff",
      };
  }
}

export function reviewedReport(state: DemoState): string {
  const details = state.details.filter(detail => detail.included).map(detail => {
    const file = state.messages.find(message => message.id === detail.sourceId)?.evidenceSource;
    return `${detail.field ?? detail.id}: ${detail.value}${detail.polarity ? `\nSupport: ${detail.polarity}` : ""}\nSource: ${detail.sourceId}${detail.value !== detail.originalValue ? " (user corrected)" : ""}${file ? `\nFile: ${file.name}\nEvidence: ${file.evidenceId}\nSHA-256: ${file.sha256}` : ""}`;
  }).join("\n\n");
  return `YAMA — SYNTHETIC DEMO REPORT\n${state.reportId ? `Report ${state.reportId}\n` : ""}Revision ${state.revision}\n${hasCurrentConfirmation(state) ? "User confirmed — not independently verified" : "Draft — not confirmed"}\n\n${details}\n\nSelected local evidence (not uploaded):\n${state.evidence.map(item => item.name).join("\n") || "None"}\n\nNo official complaint has been submitted. This is a synthetic demonstration, not a finding of guilt.`;
}
