import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const environment = { PATH: process.env.PATH, NODE_ENV: "production" as const, YAMA_DEMO_ONLY: "true", YAMA_DEPLOYMENT_MODE: "hosted-demo",
  APP_ORIGIN: "https://yamawillsave.vercel.app", MONGODB_URI: "mongodb+srv://demo:private-test-password@cluster.mongodb.net",
  MONGODB_DATABASE: "yama", BETTER_AUTH_SECRET: "a-long-test-secret-which-is-only-used-in-tests", YAMA_GRAPH_TARGET: "cloud",
  YAMA_CLOUD_FALKORDB_HOST: "instance.example.cloud", YAMA_CLOUD_FALKORDB_PORT: "59227", YAMA_CLOUD_FALKORDB_USERNAME: "falkordb", YAMA_CLOUD_FALKORDB_PASSWORD: "private-test-graph-password" };
function validate(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/deployment/check-config.ts"],
    { env: { ...environment, ...overrides }, encoding: "utf8", timeout: 10_000 });
}
describe("container configuration preflight", () => {
  it("accepts valid hosted settings without contacting databases or a provider", () => {
    const checked = validate();
    expect(checked.status, checked.stderr).toBe(0);
    expect(checked.stdout).toContain("Hosted demo configuration valid");
    expect(checked.stdout + checked.stderr).not.toContain("private-test");
  });
  it("fails before starting Next.js with safe, actionable field names", () => {
    const checked = validate({ APP_ORIGIN: "http://unsafe.example", MONGODB_URI: "mongodb+srv://demo:private-test-password@wrong.example" });
    expect(checked.status).toBe(1);
    expect(checked.stderr).toContain("APP_ORIGIN"); expect(checked.stderr).toContain("MONGODB_URI");
    expect(checked.stdout + checked.stderr).not.toContain("private-test");
    expect(checked.stdout + checked.stderr).not.toContain("wrong.example");
  });
  it("rejects a copied localhost mode in the hosted container entrypoint", () => {
    const checked = validate({ YAMA_DEPLOYMENT_MODE: "localhost", APP_ORIGIN: "http://127.0.0.1:3000", MONGODB_URI: "mongodb://127.0.0.1:27018/yama" });
    expect(checked.status).toBe(1);
    expect(checked.stderr).toContain("YAMA_DEPLOYMENT_MODE");
  });
});
