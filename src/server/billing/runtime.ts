import "server-only";
import { spawn } from "node:child_process";
import type { BillingSettings } from "./config";
export type BillingInput = {
  purchaseId?: string;
  paymentId?: string;
  origin?: string;
  productId?: string;
  businessId?: string;
};
export type BillingRunner = (
  operation: "create_checkout" | "read_payment",
  input: BillingInput,
  settings: BillingSettings,
  signal: AbortSignal,
) => Promise<unknown>;
export const runBillingProvider: BillingRunner = (
  operation,
  input,
  settings,
  signal,
) =>
  new Promise((resolve, reject) => {
    if (process.env.NODE_ENV === "test" || !settings.test || signal.aborted) {
      reject(new Error("billing_provider_disabled"));
      return;
    }
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      NODE_ENV: process.env.NODE_ENV,
      YAMA_DEMO_ONLY: "true",
      YAMA_DODO_TEST_ENABLED: "true",
      YAMA_DODO_DATA_POLICY_ACKNOWLEDGED: "true",
      DODO_PAYMENTS_API_KEY: settings.apiKey,
    };
    const child = spawn(
      process.execPath,
      ["scripts/billing-provider.mjs", operation],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let content = "",
      failed = false;
    const stop = () => {
        failed = true;
        child.kill("SIGKILL");
      },
      cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
      },
      timer = setTimeout(stop, 20000);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    child.stdout.on("data", (chunk) => {
      content += String(chunk);
      if (Buffer.byteLength(content) > 8192) stop();
    });
    child.stderr.on("data", () => undefined);
    child.stdin.on("error", stop);
    child.once("error", () => {
      cleanup();
      reject(new Error("billing_provider_unavailable"));
    });
    child.once("close", (code) => {
      cleanup();
      if (failed || code !== 0) {
        reject(new Error("billing_provider_uncertain"));
        return;
      }
      try {
        resolve(JSON.parse(content));
      } catch {
        reject(new Error("billing_provider_invalid"));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
