import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@/server/config";

const local = { YAMA_DEMO_ONLY: "true", APP_ORIGIN: "http://127.0.0.1:3000", MONGODB_URI: "mongodb://127.0.0.1:27018/yama", MONGODB_DATABASE: "yama", FALKORDB_HOST: "127.0.0.1", FALKORDB_PORT: "6380", FALKORDB_PASSWORD: "a-local-test-password", BETTER_AUTH_SECRET: "a-long-test-secret-which-is-only-used-in-tests" };

describe("localhost backend configuration", () => {
  it("accepts explicit synthetic local configuration", () => {
    expect(parseServerConfig(local).mongoDatabase).toBe("yama");
  });
  it("fails closed without a synthetic-only switch or auth secret", () => {
    expect(() => parseServerConfig({ ...local, YAMA_DEMO_ONLY: "false" })).toThrow();
    expect(() => parseServerConfig({ ...local, BETTER_AUTH_SECRET: "" })).toThrow();
  });
  it("rejects a public origin at this stage", () => {
    expect(() => parseServerConfig({ ...local, APP_ORIGIN: "https://yama.example" })).toThrow();
  });
  it("rejects malformed connection URLs without exposing their contents", () => {
    const secret = "not-a-url-with-private-password";
    expect(() => parseServerConfig({ ...local, MONGODB_URI: secret })).toThrow("Invalid backend configuration: MONGODB_URI");
    expect(() => parseServerConfig({ ...local, APP_ORIGIN: "invalid" })).toThrow("Invalid backend configuration: APP_ORIGIN");
  });
});
