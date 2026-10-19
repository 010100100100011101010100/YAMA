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

const hosted = { ...local, ...cloud, YAMA_DEPLOYMENT_MODE: "hosted-demo", APP_ORIGIN: "https://yamawillsave.vercel.app",
  MONGODB_URI: "mongodb+srv://demo:test-password@cluster.example.mongodb.net/?retryWrites=true&w=majority" };

describe("hosted synthetic deployment configuration", () => {
  it("accepts an explicit HTTPS app origin and authenticated Atlas URI", () => {
    expect(parseServerConfig(hosted)).toMatchObject({ deploymentMode: "hosted-demo", origin: hosted.APP_ORIGIN, mongoUri: hosted.MONGODB_URI, graphTarget: "cloud" });
  });
  it("uses staged cloud settings instead of copied loopback settings only in hosted mode", () => {
    const staged = { ...local, ...cloud, YAMA_DEPLOYMENT_ORIGIN: hosted.APP_ORIGIN, YAMA_CLOUD_MONGODB_URI: hosted.MONGODB_URI };
    expect(parseServerConfig(staged)).toMatchObject({ origin: local.APP_ORIGIN, mongoUri: local.MONGODB_URI });
    expect(parseServerConfig({ ...staged, YAMA_DEPLOYMENT_MODE: "hosted-demo" })).toMatchObject({ origin: hosted.APP_ORIGIN, mongoUri: hosted.MONGODB_URI });
    expect(parseServerConfig({ ...staged, YAMA_DEPLOYMENT_MODE: "hosted-demo", APP_ORIGIN: undefined, MONGODB_URI: undefined })).toMatchObject({ origin: hosted.APP_ORIGIN, mongoUri: hosted.MONGODB_URI });
  });
  it("prefers explicitly configured hosted values over staged alternatives", () => {
    expect(parseServerConfig({ ...hosted, YAMA_DEPLOYMENT_ORIGIN: "https://other.example", YAMA_CLOUD_MONGODB_URI: "mongodb+srv://other:password@other.mongodb.net" }))
      .toMatchObject({ origin: hosted.APP_ORIGIN, mongoUri: hosted.MONGODB_URI });
  });
  it("rejects unsafe origins and requires the cloud graph and synthetic-only mode", () => {
    for (const APP_ORIGIN of ["http://yama.example", "https://user:password@yama.example", "https://yama.example/path", "https://yama.example?query=1", "https://yama.example#fragment", "https://127.0.0.1"])
      expect(() => parseServerConfig({ ...hosted, APP_ORIGIN })).toThrow();
    for (const change of [{ YAMA_GRAPH_TARGET: "local" }, { YAMA_DEMO_ONLY: "false" }, { YAMA_DEPLOYMENT_MODE: "anything" }])
      expect(() => parseServerConfig({ ...hosted, ...change })).toThrow();
  });
  it("rejects unauthenticated, non-Atlas, or insecure MongoDB URLs", () => {
    for (const MONGODB_URI of ["mongodb://127.0.0.1/yama", "mongodb+srv://cluster.mongodb.net", "mongodb+srv://user:password@other.example",
      "mongodb+srv://user:password@cluster.mongodb.net.evil.example", hosted.MONGODB_URI + "&tls=false", hosted.MONGODB_URI + "&ssl=false",
      hosted.MONGODB_URI + "&tlsInsecure=true", hosted.MONGODB_URI + "&TLSAllowInvalidCertificates=true", hosted.MONGODB_URI + "&tlsAllowInvalidHostnames=true"])
      expect(() => parseServerConfig({ ...hosted, MONGODB_URI })).toThrow();
  });
  it("reports configuration field names without credential values", () => {
    try { parseServerConfig({ ...hosted, MONGODB_URI: "mongodb+srv://demo:do-not-disclose@wrong.example" }); }
    catch (error) {
      expect((error as Error).message).toBe("Invalid backend configuration: MONGODB_URI");
      expect((error as { fields: string[] }).fields).toEqual(["MONGODB_URI"]);
      return;
    }
    throw new Error("Expected unsafe hosted URI to be rejected");
  });
});
