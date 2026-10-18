import { afterEach, describe, expect, it, vi } from "vitest";
import { createDialogueApi } from "@/lib/dialogue-api";

afterEach(() => vi.unstubAllGlobals());
describe("dialogue SSE client", () => {
  it("decodes split UTF-8 frames and rejects a foreign report", async () => {
    const id = crypto.randomUUID(), dialogue = { reportId: id, version: 0, activeAgent: "saathi", automatic: false, language: "hi", messages: [], turn: null };
    const frame = new TextEncoder().encode(`event: dialogue\ndata: ${JSON.stringify(dialogue)}\n\n`);
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(frame.slice(0, 23)); controller.enqueue(frame.slice(23)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetcher);
    const receive = vi.fn();
    await createDialogueApi().subscribe!(id, new AbortController().signal, receive);
    expect(receive).toHaveBeenCalledWith(dialogue);
    await expect(createDialogueApi().subscribe!(crypto.randomUUID(), new AbortController().signal, receive)).rejects.toMatchObject({ code: "invalid_response" });
    expect(fetcher.mock.calls[0]).toBeDefined();
  });
});
