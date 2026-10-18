import { describe, expect, it } from "vitest";
import { dialogueStream } from "@/server/dialogue/stream";
import { dialogueSchema } from "@/lib/dialogue";

describe("owned dialogue stream", () => {
  it("sends typed state without starting a model and closes on abort", async () => {
    const stop = new AbortController();
    const dialogue = dialogueSchema.parse({ reportId: crypto.randomUUID(), version: 0, activeAgent: "saathi", automatic: false, language: "en", messages: [], turn: null });
    const response = dialogueStream(dialogue, async () => dialogue, stop.signal, async () => true);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(`event: dialogue\ndata: ${JSON.stringify(dialogue)}`);
    stop.abort();
    expect((await reader.read()).done).toBe(true);
  });
});
