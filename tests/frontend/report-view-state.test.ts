import { describe, expect, it } from "vitest";
import { createDemoState, demoReducer, hasCurrentConfirmation, reviewedReport } from "@/lib/demo-state";
import { reportAction } from "@/lib/report-view-state";
import { confirmedReport, connections } from "./report-fixtures";

describe("canonical saved view", () => {
  it("does not change a confirmed server revision when a local file name is selected", () => {
    const saved = demoReducer(createDemoState(), reportAction(confirmedReport()));
    const selected = demoReducer(saved, { type: "add-evidence", evidence: { id: "local-file", name: "fiction.txt", type: "text/plain", size: 10 } });
    expect(selected.revision).toBe(saved.revision); expect(hasCurrentConfirmation(selected)).toBe(true);
  });
  it("only accepts real comparison output for the current owned report and revision", () => {
    const saved = demoReducer(createDemoState(), reportAction(confirmedReport()));
    const running = demoReducer(saved, { type: "start-task", id: "query" });
    expect(demoReducer(running, { type: "finish-task", id: "query", revision: 1, outcome: "ready" })).toBe(running);
    expect(demoReducer(running, { type: "finish-task", id: "query", revision: 1, outcome: "ready", result: { ...connections(), reportId: crypto.randomUUID() } })).toBe(running);
    const ready = demoReducer(running, { type: "finish-task", id: "query", revision: 1, outcome: "ready", result: connections() });
    expect(ready.connections).toEqual(connections()); expect(ready.task?.status).toBe("ready");
  });
  it("exports readable fields with original source references and support state", () => {
    const state = demoReducer(createDemoState(), reportAction(confirmedReport())); const text = reviewedReport(state);
    expect(text).toContain("narrative: "); expect(text).toContain("Support: affirmed");
    expect(text).toContain(`Source: ${state.messages.at(-1)!.id}`); expect(text).toContain(`Report ${state.reportId}`);
  });
});
