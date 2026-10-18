import "server-only";
import { z } from "zod";

const isLoopback = (host: string) => ["127.0.0.1", "localhost", "[::1]"].includes(host);
function isLocalUrl(value: string, protocols: string[], originOnly = false) {
  try {
    const url = new URL(value);
    return isLoopback(url.hostname) && protocols.includes(url.protocol)
      && (!originOnly || (url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password));
  } catch { return false; }
}
const common = z.object({
  YAMA_DEMO_ONLY: z.literal("true"),
  APP_ORIGIN: z.url().refine(value => isLocalUrl(value, ["http:", "https:"], true)),
  MONGODB_URI: z.string().refine(value => isLocalUrl(value, ["mongodb:"])),
  MONGODB_DATABASE: z.string().regex(/^yama[a-z0-9_]{0,45}$/),
  BETTER_AUTH_SECRET: z.string().min(32),
});
const port = z.coerce.number().int().min(1024).max(65535);
const configuration = z.discriminatedUnion("YAMA_GRAPH_TARGET", [
  common.extend({
    YAMA_GRAPH_TARGET: z.literal("local"),
    FALKORDB_HOST: z.string().refine(isLoopback),
    FALKORDB_PORT: port,
    FALKORDB_PASSWORD: z.string().min(16),
  }),
  common.extend({
    YAMA_GRAPH_TARGET: z.literal("cloud"),
    YAMA_CLOUD_FALKORDB_HOST: z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i),
    YAMA_CLOUD_FALKORDB_PORT: port,
    YAMA_CLOUD_FALKORDB_USERNAME: z.string().min(1).max(128),
    YAMA_CLOUD_FALKORDB_PASSWORD: z.string().min(1),
    YAMA_CLOUD_FALKORDB_TLS: z.enum(["true", "false"]).default("true"),
  }),
]);

export function parseServerConfig(environment: Record<string, string | undefined>) {
  const parsed = configuration.safeParse({ ...environment, YAMA_GRAPH_TARGET: environment.YAMA_GRAPH_TARGET ?? "local" });
  if (!parsed.success) {
    // Never put database URLs, passwords, or malformed user values in logs.
    throw new Error(`Invalid backend configuration: ${parsed.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
  }
  const graph = parsed.data.YAMA_GRAPH_TARGET === "cloud" ? {
    graphHost: parsed.data.YAMA_CLOUD_FALKORDB_HOST,
    graphPort: parsed.data.YAMA_CLOUD_FALKORDB_PORT,
    graphPassword: parsed.data.YAMA_CLOUD_FALKORDB_PASSWORD,
    graphUsername: parsed.data.YAMA_CLOUD_FALKORDB_USERNAME,
    graphTls: parsed.data.YAMA_CLOUD_FALKORDB_TLS === "true",
  } : {
    graphHost: parsed.data.FALKORDB_HOST,
    graphPort: parsed.data.FALKORDB_PORT,
    graphPassword: parsed.data.FALKORDB_PASSWORD,
    graphUsername: undefined,
    graphTls: false,
  };
  return {
    origin: new URL(parsed.data.APP_ORIGIN).origin,
    mongoUri: parsed.data.MONGODB_URI,
    mongoDatabase: parsed.data.MONGODB_DATABASE,
    graphTarget: parsed.data.YAMA_GRAPH_TARGET,
    ...graph,
    authSecret: parsed.data.BETTER_AUTH_SECRET,
  };
}

export const getServerConfig = () => parseServerConfig(process.env);
