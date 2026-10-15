import { describe, expect, it } from "vitest";
import { createDemoState, demoReducer, hasCurrentConfirmation, matchesComparisonFixture, reviewedReport } from "@/lib/demo-state";

const loaded = () => demoReducer(createDemoState(), { type: "load-example" });
const confirmed = () => demoReducer(loaded(), { type: "confirm", acknowledged: true });

describe("the frontend review and handoff contract", () => {
  it("starts with no invented report or confirmed facts", () => {
    const state = createDemoState();
    expect(state.details).toEqual([]);
    expect(hasCurrentConfirmation(state)).toBe(false);
    expect(state.task).toBeNull();
  });

  it("gates connections until explicit review acknowledgement", () => {
    const state = demoReducer(loaded(), { type: "navigate", stage: "connections" });
    expect(state.stage).toBe("review");
    expect(demoReducer(state, { type: "confirm", acknowledged: false }).confirmedRevision).toBeNull();
    expect(hasCurrentConfirmation(confirmed())).toBe(true);
  });

  it("cannot confirm an empty or fully excluded account", () => {
    expect(hasCurrentConfirmation(demoReducer(createDemoState(), { type: "confirm", acknowledged: true }))).toBe(false);
    let state = loaded();
    for (const detail of state.details) state = demoReducer(state, { type: "include-detail", id: detail.id, included: false });
    expect(hasCurrentConfirmation(demoReducer(state, { type: "confirm", acknowledged: true }))).toBe(false);
  });

  it("preserves the source and extraction when a detail is corrected", () => {
    const state = demoReducer(confirmed(), { type: "edit-detail", id: "amount", value: "₹8,000" });
    const amount = state.details.find(detail => detail.id === "amount")!;
    expect(amount.originalValue).toBe("₹18,000");
    expect(amount.value).toBe("₹8,000");
    expect(amount.sourceId).toBe("example-story");
    expect(state.messages.find(message => message.id === "example-story")!.text).toContain("₹8,000");
    expect(hasCurrentConfirmation(state)).toBe(false);
  });

  it("does not invalidate a review for an unchanged edit", () => {
    const state = confirmed();
    expect(demoReducer(state, { type: "edit-detail", id: "amount", value: "₹18,000" })).toBe(state);
  });

  it("does not apply a fixed comparison to a changed or excluded story", () => {
    expect(matchesComparisonFixture(loaded())).toBe(true);
    expect(matchesComparisonFixture(demoReducer(loaded(), { type: "edit-detail", id: "item", value: "Laptop" }))).toBe(false);
    expect(matchesComparisonFixture(demoReducer(loaded(), { type: "include-detail", id: "story", included: false }))).toBe(false);
    expect(matchesComparisonFixture(demoReducer(loaded(), { type: "edit-detail", id: "amount", value: "₹8,000" }))).toBe(true);
  });

  it("invalidates older comparisons on corrections and ignores their late completion", () => {
    const running = demoReducer(confirmed(), { type: "start-task", id: "request-1" });
    const edited = demoReducer(running, { type: "edit-detail", id: "amount", value: "₹8,000" });
    const late = demoReducer(edited, { type: "finish-task", id: "request-1", revision: running.revision, outcome: "ready" });
    expect(late.task?.status).toBe("stale");
    expect(late.confirmedRevision).toBeNull();
  });

  it("gates background work against the reviewed revision", () => {
    expect(demoReducer(loaded(), { type: "start-task", id: "request-1" }).task).toBeNull();
  });

  it("hands from Saathi to Disha while Drishti works without clearing the transcript", () => {
    const state = demoReducer(confirmed(), { type: "start-task", id: "request-1" });
    expect(state.activeAgent).toBe("disha");
    expect(state.messages.map(message => message.agent)).toContain("saathi");
    expect(state.messages.at(-1)?.agent).toBe("disha");
    expect(state.task?.status).toBe("running");
  });

  it("honors the user's choice to disable automatic handoffs", () => {
    const manual = demoReducer(confirmed(), { type: "automatic-handoffs", enabled: false });
    const state = demoReducer(manual, { type: "start-task", id: "request-1" });
    expect(state.activeAgent).toBe("saathi");
  });

  it("hands next steps to Disha and pauses a voice preview at the boundary", () => {
    let state = demoReducer(confirmed(), { type: "mode", mode: "voice" });
    state = demoReducer(state, { type: "voice", status: "playing" });
    const handed = demoReducer(state, { type: "navigate", stage: "steps" });
    expect(handed.activeAgent).toBe("disha");
    expect(handed.voice).toBe("paused");
    const manual = demoReducer(state, { type: "automatic-handoffs", enabled: false });
    expect(demoReducer(manual, { type: "navigate", stage: "steps" }).activeAgent).toBe("saathi");
  });

  it("a completed background task does not steal the speaking turn", () => {
    const running = demoReducer(confirmed(), { type: "start-task", id: "request-1" });
    const state = demoReducer(running, { type: "finish-task", id: "request-1", revision: running.revision, outcome: "ready" });
    expect(state.activeAgent).toBe("disha");
    expect(state.task?.status).toBe("ready");
  });

  it("ignores duplicates and results from a replaced request", () => {
    const running = demoReducer(confirmed(), { type: "start-task", id: "request-1" });
    const replacement = demoReducer(running, { type: "start-task", id: "request-2" });
    expect(demoReducer(replacement, { type: "finish-task", id: "request-1", revision: replacement.revision, outcome: "ready" })).toBe(replacement);
    const completed = demoReducer(replacement, { type: "finish-task", id: "request-2", revision: replacement.revision, outcome: "ready" });
    expect(demoReducer(completed, { type: "finish-task", id: "request-2", revision: completed.revision, outcome: "failed" })).toBe(completed);
  });

  it("preserves the story and selected agent across voice/text interruption", () => {
    let state = demoReducer(loaded(), { type: "select-agent", agent: "drishti" });
    state = demoReducer(state, { type: "mode", mode: "voice" });
    state = demoReducer(state, { type: "voice", status: "interrupted" });
    state = demoReducer(state, { type: "mode", mode: "text" });
    expect(state.activeAgent).toBe("drishti");
    expect(state.messages.some(message => message.id === "example-story")).toBe(true);
    expect(state.voice).toBe("off");
  });

  it("keeps Hindi and Hinglish wording unchanged and makes new notes require review", () => {
    const text = "Maine ₹8,000 दिए थे। Date yaad nahi hai.";
    const state = demoReducer(confirmed(), { type: "send-message", id: "note-1", text });
    expect(state.messages.find(message => message.id === "note-1")?.text).toBe(text);
    expect(state.details.at(-1)?.value).toBe(text);
    expect(state.confirmedRevision).toBeNull();
  });

  it("can cancel processing and rejects a result after cancellation", () => {
    const running = demoReducer(confirmed(), { type: "start-task", id: "request-1" });
    const canceled = demoReducer(running, { type: "cancel-task" });
    expect(demoReducer(canceled, { type: "finish-task", id: "request-1", revision: canceled.revision, outcome: "ready" })).toBe(canceled);
    expect(canceled.task?.status).toBe("canceled");
  });

  it("exports only included details and current reviewed state", () => {
    let state = confirmed();
    state = demoReducer(state, { type: "include-detail", id: "amount", included: false });
    const report = reviewedReport(state);
    expect(report).toContain("Draft — not confirmed");
    expect(report).not.toContain("₹18,000");
    expect(report).toContain("No official complaint has been submitted");
    state.messages.push({ id: "file-source", agent: "you", text: "Original record", evidenceSource: { evidenceId: "file-id", sha256: "a".repeat(64), name: "record.txt" } });
    state.details.push({ id: "file-note", field: "note", value: "Corrected record", originalValue: "Original record", sourceId: "file-source", included: true });
    const withFile = reviewedReport(state);
    expect(withFile).toContain("Source: file-source (user corrected)");
    expect(withFile).toContain("File: record.txt\nEvidence: file-id\nSHA-256: " + "a".repeat(64));
  });
});
