import { describe, expect, it } from "vitest";
import { createReport } from "@/server/reports/domain";
import { dialogueContext } from "@/server/dialogue/runtime";
import type { DialogueRecord } from "@/server/dialogue/service";
import { AGENT_ADAPTER } from "@/lib/agent-task";

describe("bounded follow-up context", () => {
  it("shortens generated history while preserving user questions and incident corrections", () => {
    const report = createReport("private-owner", { synthetic: true, language: "en", narrative: "My corrected account. ".repeat(90) }, crypto.randomUUID());
    const messageId = report.messages[0].id;
    const history = Array.from({ length: 6 }, (_, index) => ({ id: crypto.randomUUID(), messageId, agent: "saathi" as const, revision: 1,
      text: "An earlier generated answer. ".repeat(140).slice(0, 4000), language: "en" as const, adapter: AGENT_ADAPTER,
      userPrompt: { id: crypto.randomUUID(), text: `Question ${index}: ${"Keep my words. ".repeat(50)}` } }));
    const record: DialogueRecord = { _id: report._id, ownerId: report.ownerId, version: 1, activeAgent: "saathi", automatic: false, language: "en", messages: history, requests: [], updatedAt: new Date(),
      turn: { id: crypto.randomUUID(), agent: "saathi", revision: 1, messageId, status: "running", adapter: AGENT_ADAPTER, reply: null, errorCode: null, language: "en", depth: 0, attempts: 1, claimToken: null, leaseUntil: null, executionConfigHash: null,
        userPrompt: { id: crypto.randomUUID(), text: "What changed between those reports?" } } };
    const context = dialogueContext(report, record);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(24000);
    expect(context.history.map(message => message.userPrompt)).toEqual(history.map(message => message.userPrompt.text));
    expect(context.history.every(message => message.text.length <= 1001)).toBe(true);
    expect(context.assertions[0].originalValue).toBe(report.messages[0].text);
    expect(context.messages.at(-1)?.text).toBe(record.turn!.userPrompt!.text);
    expect(context.intent).toBe("question");
  });
});
