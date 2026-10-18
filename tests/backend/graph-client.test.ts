import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@redis/client";
import { connectGraph } from "@/server/database/graph-client";

vi.mock("@redis/client", () => ({ createClient: vi.fn() }));
const redis = { on: vi.fn(), connect: vi.fn(), destroy: vi.fn(), isOpen: true, isReady: true };
beforeEach(() => {
  vi.clearAllMocks();
  redis.connect.mockResolvedValue(undefined);
  vi.mocked(createClient).mockReturnValue(redis as unknown as ReturnType<typeof createClient>);
});

describe("FalkorDB connection transport", () => {
  it("preserves the password-only local connection", async () => {
    const client = await connectGraph("127.0.0.1", 6380, "local-test-password");
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ password: "local-test-password", socket: expect.objectContaining({ host: "127.0.0.1", port: 6380, tls: false }) }));
    expect(client.isReady()).toBe(true);
    await client.close();
    expect(redis.destroy).toHaveBeenCalledOnce();
  });
  it("passes the cloud ACL username and verifies the TLS certificate and hostname", async () => {
    await connectGraph("instance.example.cloud", 59227, "cloud-test-password", { username: "falkordb", tls: true });
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ username: "falkordb", password: "cloud-test-password",
      socket: expect.objectContaining({ tls: true, servername: "instance.example.cloud", rejectUnauthorized: true, reconnectStrategy: false }) }));
    expect(redis.on).toHaveBeenCalledBefore(redis.connect);
  });
  it("redacts authentication and network errors and closes failed connections", async () => {
    redis.connect.mockRejectedValueOnce(new Error("WRONGPASS cloud-test-password"));
    await expect(connectGraph("instance.example.cloud", 59227, "cloud-test-password", { username: "falkordb", tls: true })).rejects.toThrow(/^graph_unavailable$/);
    expect(redis.destroy).toHaveBeenCalledOnce();
  });
});
