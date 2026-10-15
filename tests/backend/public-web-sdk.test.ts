import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
describe("installed public web SDKs with fake transports", () => {
  for (const mode of ["search", "parse", "parse-error", "large-response"])
    it(mode, async () => {
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["scripts/public-web-provider-probe.mjs", mode],
          {
            env: { NODE_ENV: "test", PATH: process.env.PATH },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let content = "";
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("SDK fixture timed out"));
        }, 12000);
        child.stdout.on("data", (chunk) => {
          content += String(chunk);
        });
        child.stderr.on("data", () => undefined);
        child.once("error", () => {
          clearTimeout(timer);
          reject(new Error("SDK fixture unavailable"));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (code !== 0) reject(new Error("SDK fixture failed"));
          else resolve(content);
        });
      });
      expect(JSON.parse(output)).toEqual({
        passed: true,
        requests: 1,
        network: false,
      });
    });
});
