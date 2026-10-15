import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
import { PUBLIC_WEB_POLICY } from "./policy";

const settingsSchema = z.object({
  YAMA_DEMO_ONLY: z.literal("true"),
  YAMA_PUBLIC_WEB_PROVIDER: z.enum(["fixture", "live"]).default("fixture"),
  YAMA_PUBLIC_WEB_MAX_SEARCHES: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10),
  YAMA_PUBLIC_WEB_MAX_PAGES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(15),
  YAMA_PUBLIC_WEB_MAX_EXA_MICRO_USD: z.coerce
    .number()
    .int()
    .min(10000)
    .max(1000000)
    .default(100000),
  YAMA_PUBLIC_WEB_MAX_FIRECRAWL_CREDITS: z.coerce
    .number()
    .int()
    .min(5)
    .max(500)
    .default(50),
});
export function publicWebSettings(
  environment: Record<string, string | undefined> = process.env,
) {
  const parsed = settingsSchema.safeParse(environment);
  if (!parsed.success) throw new ServiceError(503, "public_web_not_configured");
  const value = parsed.data,
    live = value.YAMA_PUBLIC_WEB_PROVIDER === "live";
  if (
    live &&
    (environment.YAMA_PUBLIC_WEB_LIVE_ENABLED !== "true" ||
      environment.YAMA_PUBLIC_WEB_DATA_POLICY_ACKNOWLEDGED !== "true" ||
      (environment.EXA_API_KEY?.trim().length ?? 0) < 8 ||
      (environment.FIRECRAWL_API_KEY?.trim().length ?? 0) < 8)
  )
    throw new ServiceError(503, "public_web_not_configured");
  return {
    live,
    exaKey: live ? environment.EXA_API_KEY! : "",
    firecrawlKey: live ? environment.FIRECRAWL_API_KEY! : "",
    maxSearches: value.YAMA_PUBLIC_WEB_MAX_SEARCHES,
    maxPages: value.YAMA_PUBLIC_WEB_MAX_PAGES,
    maxExaMicroUsd: value.YAMA_PUBLIC_WEB_MAX_EXA_MICRO_USD,
    maxFirecrawlCredits: value.YAMA_PUBLIC_WEB_MAX_FIRECRAWL_CREDITS,
  };
}
export type PublicWebSettings = ReturnType<typeof publicWebSettings>;
export const publicWebConfigHash = (settings: PublicWebSettings) =>
  createHash("sha256")
    .update(JSON.stringify({ policy: PUBLIC_WEB_POLICY, ...settings }))
    .digest("hex");
export const SEARCH_RESERVATION_MICRO_USD = 10000;
export const PAGE_RESERVATION_CREDITS = 5;
export function publicWebAdapter(
  live: boolean,
  operation: "search_public_web" | "fetch_public_page",
) {
  return live
    ? {
        provider:
          operation === "search_public_web"
            ? ("exa" as const)
            : ("firecrawl" as const),
        version:
          operation === "search_public_web"
            ? "exa-js@2.25.0"
            : "firecrawl@4.46.0",
        live: true,
      }
    : {
        provider: "fixture" as const,
        version: "public-web-fixture-v1",
        live: false,
      };
}
