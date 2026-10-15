import { EXAMPLE_STORY, type Language } from "./demo-state";
import { ReportApiError, type Proposal, type ReportApi, type ReportChange, type SavedReport } from "./report-api";

type Attempt = { before: SavedReport; change: ReportChange | "confirm" };
function applied(attempt: Attempt, current: SavedReport) {
  const { before, change } = attempt;
  if (change === "confirm") return current.revision === before.revision && current.confirmation?.revision === before.revision;
  if (current.revision !== before.revision + 1) return false;
  if (change.operation === "add_message") return current.messages.length === before.messages.length + 1 && current.messages.at(-1)?.text === change.text;
  if (change.operation === "review_evidence") return current.messages.some(message => message.evidenceSource?.evidenceId === change.evidenceId && message.evidenceSource.sha256 === change.sha256 && (!change.textSha256 || message.evidenceSource.extraction?.textSha256 === change.textSha256));
  if (change.operation === "correct_assertion") {
    const assertion = current.assertions.find(item => item.id === change.assertionId);
    return !!assertion && (change.value === undefined || assertion.value === change.value)
      && (change.included === undefined || assertion.included === change.included) && (change.polarity === undefined || assertion.polarity === change.polarity);
  }
  if (change.operation === "accept_agent_proposals") {
    const added = current.assertions.filter(assertion => !before.assertions.some(old => old.id === assertion.id));
    return added.length === change.proposalIds.length && added.every(assertion => assertion.agentSource?.taskId === change.taskId);
  }
  const added = current.assertions.filter(assertion => !before.assertions.some(old => old.id === assertion.id));
  return added.length === change.proposals.length && change.proposals.every(proposal => added.some(assertion =>
    assertion.field === proposal.field && assertion.originalValue === proposal.value && assertion.polarity === (proposal.polarity ?? "affirmed")
    && assertion.source.messageId === proposal.source.messageId && assertion.source.start === proposal.source.start && assertion.source.end === proposal.source.end));
}
export function exampleProposals(message: SavedReport["messages"][number]): Proposal[] {
  const range = (quote: string) => { const start = message.text.indexOf(quote); return { messageId: message.id, start, end: start + quote.length }; };
  // Authored demo proposals, including a deliberately incorrect amount for correction practice.
  // These are not model extraction; never apply them to arbitrary narration.
  return [
    { field: "amount", value: "₹18,000", source: range("₹8,000") },
    { field: "item", value: "phone", source: range("used phone") },
    { field: "date", value: "Not remembered", source: range("don’t remember the exact date") },
    { field: "pattern", value: "paid", source: range("I paid") },
    { field: "pattern", value: "promised_delivery", source: range("promised to deliver it") },
    { field: "pattern", value: "no_reply", source: range("stopped replying") },
  ];
}
export function exampleComplete(report: SavedReport) {
  const message = report.messages.find(message => message.text === EXAMPLE_STORY);
  return !!message && exampleProposals(message).every(proposal => report.assertions.some(assertion =>
    assertion.source.messageId === message.id && assertion.field === proposal.field && assertion.originalValue === proposal.value));
}

export class ReportSession {
  report: SavedReport | null = null;
  synchronized = true;
  private creation: { text: string; language: Language; key: string } | null = null;
  private pending: Attempt | null = null;
  constructor(readonly api: ReportApi) {}
  adopt(report: SavedReport) {
    if (this.pending || this.creation || !this.synchronized) throw new ReportApiError("revision_conflict");
    if (this.report && (this.report._id !== report._id || this.report.revision > report.revision)) return false;
    this.report = report; this.synchronized = true; return true;
  }
  unchanged(change: ReportChange) {
    if (!this.synchronized || this.pending || change.operation !== "correct_assertion") return false;
    const assertion = this.report?.assertions.find(assertion => assertion.id === change.assertionId);
    return !!assertion && (change.value === undefined || change.value === assertion.value)
      && (change.included === undefined || change.included === assertion.included) && (change.polarity === undefined || change.polarity === assertion.polarity);
  }
  async restore(signal: AbortSignal, keepCurrent = false, initialReportId?:string|null) {
    const saved = keepCurrent && this.report ? await this.api.get(this.report._id, signal) : typeof initialReportId === "string" ? await this.api.get(initialReportId,signal) : await this.api.restore(signal);
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    this.report = initialReportId === null && !keepCurrent ? null : saved;
    this.synchronized = true;
    return this.report;
  }
  async send(text: string, language: Language) {
    if (this.creation) {
      this.synchronized = false;
      const pending = this.creation;
      this.report = await this.api.create(pending.text, pending.language, pending.key);
      this.creation = null;
      this.synchronized = true;
      if (text === pending.text) return this.report;
    }
    if (!this.report) {
      this.synchronized = false;
      this.creation = { text, language, key: crypto.randomUUID() };
      this.report = await this.api.create(text, language, this.creation.key);
      this.creation = null;
      this.synchronized = true;
      return this.report;
    }
    return this.revise({ operation: "add_message", text });
  }
  private async write(change: Attempt["change"]) {
    if (!this.report) throw new ReportApiError("report_not_found");
    if (this.pending) {
      const previous = this.pending;
      const latest = await this.api.get(previous.before._id);
      this.report = latest;
      this.synchronized = true;
      this.pending = null;
      if (JSON.stringify(change) === JSON.stringify(previous.change) && applied(previous, latest)) return latest;
      if (latest.revision !== previous.before.revision) throw new ReportApiError("revision_conflict");
    }
    if (change !== "confirm" && this.unchanged(change)) return this.report;
    const before = this.report;
    const attempt = { before, change };
    this.pending = attempt;
    this.synchronized = false;
    try {
      const saved = change === "confirm" ? await this.api.confirm(before._id, before.revision)
        : await this.api.revise(before._id, before.revision, change);
      if (saved._id !== before._id) throw new ReportApiError("invalid_response");
      this.report = saved; this.pending = null;
      this.synchronized = true;
      return saved;
    } catch (error) {
      if (error instanceof ReportApiError && error.code === "authentication_required") throw error;
      // A timed-out write may have committed. Read before allowing a retry.
      let latest: SavedReport;
      try { latest = await this.api.get(before._id); }
      catch { throw error; }
      this.report = latest;
      this.synchronized = true;
      if (error instanceof ReportApiError && error.code === "revision_conflict") { this.pending = null; throw error; }
      if (applied(attempt, latest)) { this.pending = null; return latest; }
      if (latest.revision !== before.revision) { this.pending = null; throw new ReportApiError("revision_conflict"); }
      throw error;
    }
  }
  revise(change: ReportChange) { return this.write(change); }
  confirm() { return this.write("confirm"); }
  async addExample(language: Language) {
    let message = this.report?.messages.find(message => message.text === EXAMPLE_STORY);
    if (!message) { await this.send(EXAMPLE_STORY, language); message = this.report!.messages.find(message => message.text === EXAMPLE_STORY)!; }
    const missing = exampleProposals(message).filter(proposal => !this.report!.assertions.some(assertion =>
      assertion.source.messageId === message.id && assertion.field === proposal.field && assertion.originalValue === proposal.value));
    if (missing.length) await this.revise({ operation: "propose_assertions", proposals: missing });
    return this.report!;
  }
}

export async function waitForConnections(api: ReportApi, report: SavedReport, signal: AbortSignal) {
  // A paused/offline worker must become a visible retry state, not an endless loader.
  for (let attempt = 0; attempt < 45; attempt++) {
    signal.throwIfAborted();
    const result = await api.connections(report._id, signal);
    signal.throwIfAborted();
    if (result.reportId !== report._id) throw new ReportApiError("invalid_response");
    if (result.revision !== report.revision) throw new ReportApiError("revision_conflict");
    if (result.status === "ready") return result;
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new ReportApiError("projection_pending");
}
