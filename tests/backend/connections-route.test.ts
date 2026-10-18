import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ find: vi.fn(async () => []) }));
vi.mock("@/server/http", () => ({ authenticated: (_request: Request, action: (owner: string) => Promise<Response>) => action("owner"), reportId: (id: string) => id,
  repository: () => ({}), response: (body: unknown) => Response.json(body) }));
vi.mock("@/server/config", () => ({ getServerConfig: () => ({ mongoDatabase: "yama_test" }) }));
vi.mock("@/server/database/graph", () => ({ getGraphClient: async () => ({}), GraphStore: class { findConnections = calls.find; readPatternSources = async () => []; } }));
vi.mock("@/server/reports/connections", () => ({ getConnections: async (_repository: unknown, graph: { findConnections: (...args: unknown[]) => Promise<unknown> }, owner: string, id: string) => {
  await graph.findConnections(owner, id, 2, ["amount:18400"], "The reviewed narrative"); return { status: "ready" };
} }));
import { GET } from "@/app/api/reports/[id]/connections/route";

describe("connections HTTP retrieval", () => {
  it("forwards exact detail and semantic seeds to the graph store", async () => {
    await GET(new Request("http://127.0.0.1:3000/api/reports/example/connections"), { params: Promise.resolve({ id: "example" }) });
    expect(calls.find).toHaveBeenCalledWith("owner", "example", 2, ["amount:18400"], "The reviewed narrative");
  });
});
