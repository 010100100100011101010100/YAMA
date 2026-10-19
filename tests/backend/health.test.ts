import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendConfigurationError } from "@/server/config";

const probes = vi.hoisted(() => ({ configuration: vi.fn(), mongo: vi.fn(), graph: vi.fn() }));
vi.mock("@/server/config", async importOriginal => ({ ...await importOriginal<typeof import("@/server/config")>(), getServerConfig: probes.configuration }));
vi.mock("@/server/database/mongo", () => ({ getDatabase: () => ({ command: probes.mongo }) }));
vi.mock("@/server/database/graph", () => ({ getGraphClient: async () => ({ list: probes.graph }) }));
vi.mock("@/server/http", () => ({ response: (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }) }));
import { GET } from "@/app/api/health/route";

beforeEach(() => {
  probes.configuration.mockReturnValue({ deploymentMode: "hosted-demo" });
  probes.mongo.mockResolvedValue({ ok: 1 }); probes.graph.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("deployment readiness", () => {
  it("reports readiness only when configuration and both databases pass", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ready", mode: "synthetic_hosted", checks: { configuration: "ready", mongo: "ready", graph: "ready" } });
  });
  it("reports invalid configuration fields before contacting databases", async () => {
    probes.configuration.mockImplementationOnce(() => { throw new BackendConfigurationError(["APP_ORIGIN", "MONGODB_URI"]); });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "backend_configuration_invalid", fields: ["APP_ORIGIN", "MONGODB_URI"] } });
    expect(probes.mongo).not.toHaveBeenCalled(); expect(probes.graph).not.toHaveBeenCalled();
  });
  it("identifies an unavailable dependency without returning or logging its raw error", async () => {
    probes.graph.mockRejectedValueOnce(new Error("redis://private-user:private-password@private-host"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ checks: { mongo: "ready", graph: "unavailable" } });
    expect(body).not.toContain("private-");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-");
  });
  it("returns a failure before Render's five-second health-check deadline", async () => {
    vi.useFakeTimers();
    probes.mongo.mockReturnValueOnce(new Promise(() => undefined));
    const pending = GET();
    await vi.advanceTimersByTimeAsync(4000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ checks: { mongo: "unavailable", graph: "ready" } });
    expect(vi.getTimerCount()).toBe(0);
  });
});
