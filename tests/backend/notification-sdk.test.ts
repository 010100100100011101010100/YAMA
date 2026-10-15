import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
describe("installed notification SDKs with fake transports", () => {
  for (const mode of [
    "resend-accepted",
    "resend-rejected",
    "resend-refused",
    "resend-reset",
    "resend-unavailable",
    "resend-large",
    "gmail-accepted",
    "gmail-reset",
    "gmail-no-ack",
  ])
    it(mode, async () => {
      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["scripts/notification-provider-probe.mjs", mode],
          {
            env: { NODE_ENV: "production", PATH: process.env.PATH },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let body = "";
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("Mail SDK fixture timed out"));
        }, 12000);
        child.stdout.on("data", (chunk) => {
          body += String(chunk);
        });
        child.stderr.on("data", () => undefined);
        child.once("error", () => {
          clearTimeout(timeout);
          reject(new Error("Mail SDK fixture unavailable"));
        });
        child.once("close", (code) => {
          clearTimeout(timeout);
          if (code !== 0) reject(new Error("Mail SDK fixture failed"));
          else resolve(body);
        });
      });
      expect(JSON.parse(result)).toEqual({
        passed: true,
        requests: 1,
        network: false,
      });
    });
});
