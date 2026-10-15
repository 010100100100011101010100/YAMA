import { z } from "zod";
import { assistanceSchema } from "./assistance";

export const publicTopicSchema = z.enum([
  "cyber_reporting",
  "consumer_reporting",
  "cyber_safety",
]);
const reference = z.uuid();
const actor = z.enum(["drishti", "disha"]);
const revision = z.number().int().positive();
const shared = { expectedRevision: revision, agent: actor, key: reference };
export const publicWebCommand = z.discriminatedUnion("operation", [
  z.strictObject({
    ...shared,
    operation: z.literal("search_public_web"),
    topic: publicTopicSchema,
    reason: z.enum(["public_source_requested", "freshness_requested"]),
  }),
  z.strictObject({
    ...shared,
    operation: z.literal("fetch_public_page"),
    searchId: reference,
    sourceId: reference,
  }),
]);
export type PublicWebCommand = z.infer<typeof publicWebCommand>;
export const publicSourceSchema = z.strictObject({
  id: reference,
  url: z.url().max(1000),
  title: z.string().min(1).max(200),
  publisher: z.string().min(1).max(100),
  publishedAt: z.string().max(50).nullable(),
  retrievedAt: z.iso.datetime(),
  trust: z.enum(["unverified_index", "authored_fixture"]),
  contentIsUntrusted: z.literal(true),
});
export const publicWebResult = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("search"),
    query: z.string().max(200),
    localGuidance: assistanceSchema,
    sources: z.array(publicSourceSchema).max(3),
    omittedCount: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal("page"),
    source: publicSourceSchema,
    discoveredUrl: z.url().max(1000),
    text: z.string().min(1).max(8000),
    truncated: z.boolean(),
    htmlSha256: z.string().regex(/^[a-f0-9]{64}$/),
    textSha256: z.string().regex(/^[a-f0-9]{64}$/),
    redirects: z.array(z.url().max(1000)).max(3),
    verification: z.enum(["unverified_public_source", "authored_fixture"]),
    contentIsUntrusted: z.literal(true),
  }),
]);
export type PublicWebResult = z.infer<typeof publicWebResult>;
export const publicWebView = z.strictObject({
  id: reference,
  reportId: reference,
  revision,
  agent: actor,
  topic: publicTopicSchema,
  operation: z.enum(["search_public_web", "fetch_public_page"]),
  status: z.enum(["queued", "running", "ready", "failed", "canceled", "stale"]),
  expiresAt: z.iso.datetime(),
  errorCode: z.string().max(80).nullable(),
  result: publicWebResult.nullable(),
  adapter: z.strictObject({
    provider: z.enum(["fixture", "exa", "firecrawl"]),
    version: z.string().max(80),
    live: z.boolean(),
  }),
  reused: z.boolean(),
  localGuidance: assistanceSchema,
});
export type PublicWebView = z.infer<typeof publicWebView>;
