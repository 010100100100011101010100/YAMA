import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@/server/config";

const local = { YAMA_DEMO_ONLY: "true", APP_ORIGIN: "http://127.0.0.1:3000", MONGODB_URI: "mongodb://127.0.0.1:27018/yama", MONGODB_DATABASE: "yama", FALKORDB_HOST: "127.0.0.1", FALKORDB_PORT: "6380", FALKORDB_PASSWORD: "a-local-test-password", BETTER_AUTH_SECRET: "a-long-test-secret-which-is-only-used-in-tests" };
const cloud = { YAMA_GRAPH_TARGET: "cloud", YAMA_CLOUD_FALKORDB_HOST: "instance.example.cloud", YAMA_CLOUD_FALKORDB_PORT: "59227",
  YAMA_CLOUD_FALKORDB_USERNAME: "falkordb", YAMA_CLOUD_FALKORDB_PASSWORD: "test-only" };

describe("localhost backend configuration", () => {
  it("accepts explicit synthetic local configuration", () => {
    expect(parseServerConfig(local)).toMatchObject({ mongoDatabase: "yama", graphTarget: "local", graphTls: false });
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
  it("keeps staged cloud credentials inactive until explicitly selected", () => {
    expect(parseServerConfig({ ...local, ...cloud, YAMA_GRAPH_TARGET: "local" })).toMatchObject({ graphHost: "127.0.0.1", graphPassword: local.FALKORDB_PASSWORD });
    expect(() => parseServerConfig({ ...local, FALKORDB_HOST: cloud.YAMA_CLOUD_FALKORDB_HOST })).toThrow();
  });
  it("selects cloud ACL credentials and verified TLS without changing MongoDB", () => {
    expect(parseServerConfig({ ...local, ...cloud })).toMatchObject({ graphTarget: "cloud", graphHost: cloud.YAMA_CLOUD_FALKORDB_HOST,
      graphPort: 59227, graphUsername: "falkordb", graphPassword: "test-only", graphTls: true, mongoUri: local.MONGODB_URI });
  });
  it("requires an explicit setting for a cloud endpoint without TLS", () => {
    expect(parseServerConfig({ ...local, ...cloud, YAMA_CLOUD_FALKORDB_TLS: "false" }).graphTls).toBe(false);
    expect(() => parseServerConfig({ ...local, ...cloud, YAMA_CLOUD_FALKORDB_TLS: "invalid" })).toThrow();
  });
  it("requires complete cloud settings without leaking credentials", () => {
    for (const key of ["YAMA_CLOUD_FALKORDB_HOST", "YAMA_CLOUD_FALKORDB_PORT", "YAMA_CLOUD_FALKORDB_USERNAME", "YAMA_CLOUD_FALKORDB_PASSWORD"]) {
      expect(() => parseServerConfig({ ...local, ...cloud, [key]: "" })).toThrow(`Invalid backend configuration: ${key}`);
    }
    expect(() => parseServerConfig({ ...local, ...cloud, YAMA_CLOUD_FALKORDB_HOST: "redis://user:private-password@host.cloud" })).toThrow("Invalid backend configuration: YAMA_CLOUD_FALKORDB_HOST");
  });
  it("retains synthetic mode and localhost app/MongoDB restrictions with a cloud graph", () => {
    for (const change of [{ YAMA_DEMO_ONLY: "false" }, { APP_ORIGIN: "https://yama.example" }, { MONGODB_URI: "mongodb://remote.example/yama" }, { YAMA_GRAPH_TARGET: "invalid" }]) {
      expect(() => parseServerConfig({ ...local, ...cloud, ...change })).toThrow();
    }
  });
});
