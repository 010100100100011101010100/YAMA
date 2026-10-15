import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
describe("installed Dodo SDK with fake test-mode transport", () => {
  for (const mode of [
    "create",
    "read",
    "wrong-price",
    "native-entitlements",
    "unavailable",
  ])
    it(mode, async () => {
      const body = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["scripts/billing-provider-probe.mjs", mode],
          {
            env: { NODE_ENV: "production", PATH: process.env.PATH },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let content = "";
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("Dodo SDK fixture timed out"));
        }, 20000);
        child.stdout.on("data", (chunk) => {
          content += String(chunk);
        });
        child.stderr.on("data", () => undefined);
        child.once("error", () => {
          clearTimeout(timeout);
          reject(new Error("Dodo SDK fixture unavailable"));
        });
        child.once("close", (code) => {
          clearTimeout(timeout);
          if (code !== 0) reject(new Error("Dodo SDK fixture failed"));
          else resolve(content);
        });
      });
      expect(JSON.parse(body)).toEqual({
        passed: true,
        requests: mode === "create" ? 2 : 1,
        network: false,
      });
    });
});
