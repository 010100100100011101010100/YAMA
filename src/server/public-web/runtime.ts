import "server-only";
import { spawn } from "node:child_process";
import { ServiceError } from "@/server/errors";
import type { PublicWebSettings } from "./config";
export type PublicProviderRunner = (
  operation: "search_public_web" | "fetch_public_page",
  payload: { query: string; domains: readonly string[] } | { html: string },
  settings: PublicWebSettings,
  signal: AbortSignal,
) => Promise<unknown>;
export const runPublicProvider: PublicProviderRunner = (
  operation,
  payload,
  settings,
  signal,
) =>
  new Promise((resolve, reject) => {
    if (process.env.NODE_ENV === "test") {
      reject(new ServiceError(503, "live_provider_disabled_in_tests"));
      return;
    }
    const environment: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      NODE_ENV: process.env.NODE_ENV,
      YAMA_DEMO_ONLY: "true",
      YAMA_PUBLIC_WEB_LIVE_ENABLED: "true",
      YAMA_PUBLIC_WEB_DATA_POLICY_ACKNOWLEDGED: "true",
      ...(operation === "search_public_web"
        ? { EXA_API_KEY: settings.exaKey }
        : { FIRECRAWL_API_KEY: settings.firecrawlKey }),
    };
    const child = spawn(
      process.execPath,
      ["scripts/public-web-provider.mjs", operation],
      { env: environment, stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let bytes = 0,
      failed = false;
    const stop = () => {
      failed = true;
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    const timer = setTimeout(stop, 15000),
      cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
      };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 300000) stop();
      else chunks.push(chunk);
    });
    child.stderr.on("data", () => undefined);
    child.stdin.on("error", stop);
    child.once("error", () => {
      cleanup();
      reject(new ServiceError(503, "public_provider_unavailable"));
    });
    child.once("close", (code) => {
      cleanup();
      if (failed || code !== 0) {
        reject(new ServiceError(503, "public_provider_failed"));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new ServiceError(503, "public_provider_invalid"));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
