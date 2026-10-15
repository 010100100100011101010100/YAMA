import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentApi } from "@/lib/agent-api";
import { agentTask } from "./agent-fixtures";
import { reportId } from "./report-fixtures";

afterEach(() => vi.unstubAllGlobals());
describe("agent receipt HTTP adapter", () => {
  it("sends same-origin credentials, revision and a repeatable request key", async () => {
    const fetcher = vi.fn(async () => Response.json({ task: agentTask("queued") }, { status: 202 })); vi.stubGlobal("fetch", fetcher);
    await createAgentApi().start(reportId, 1, "request-key");
    expect(fetcher).toHaveBeenCalledWith(`/api/reports/${reportId}/agent-tasks`, expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store",
      body: JSON.stringify({ expectedRevision: 1 }), headers: expect.objectContaining({ "Idempotency-Key": "request-key" }) }));
  });
  it("rejects receipts for a different report, revision or inconsistent state", async () => {
    const api = createAgentApi();
    for (const task of [{ ...agentTask(), reportId: crypto.randomUUID() }, { ...agentTask(), revision: 2 }, { ...agentTask("queued"), result: agentTask().result }]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ task })));
      await expect(api.start(reportId, 1, crypto.randomUUID())).rejects.toThrow("invalid_response");
    }
  });
  it("restores durable task history and validates cancellation identity", async () => {
    const task = agentTask(); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ tasks: [task] })));
    expect(await createAgentApi().list(reportId, new AbortController().signal)).toEqual([task]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ task: { ...agentTask("canceled"), id: crypto.randomUUID() } })));
    await expect(createAgentApi().cancel(reportId, task.id)).rejects.toThrow("invalid_response");
  });
  it("preserves authentication failures and caller cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "authentication_required" } }, { status: 401 })));
    await expect(createAgentApi().list(reportId, new AbortController().signal)).rejects.toThrow("authentication_required");
    const controller = new AbortController(); controller.abort(); vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("aborted"); }));
    await expect(createAgentApi().list(reportId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
