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
function isHostedOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isLoopback(url.hostname) && url.pathname === "/"
      && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
function isAtlasUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "mongodb+srv:" || !url.hostname.endsWith(".mongodb.net") || !url.username || !url.password || url.port || url.hash) return false;
    for (const [key, value] of url.searchParams) {
      if (["tls", "ssl"].includes(key.toLowerCase()) && value.toLowerCase() !== "true") return false;
      if (["tlsinsecure", "tlsallowinvalidcertificates", "tlsallowinvalidhostnames"].includes(key.toLowerCase()) && value.toLowerCase() !== "false") return false;
    }
    return true;
  } catch { return false; }
}

export class BackendConfigurationError extends Error {
  constructor(readonly fields: string[]) { super(`Invalid backend configuration: ${fields.join(", ")}`); }
}
const common = z.object({
  YAMA_DEMO_ONLY: z.literal("true"),
  YAMA_DEPLOYMENT_MODE: z.enum(["localhost", "hosted-demo"]),
  APP_ORIGIN: z.url(),
  MONGODB_URI: z.string(),
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
]).superRefine((value, context) => {
  const hosted = value.YAMA_DEPLOYMENT_MODE === "hosted-demo";
  if (!(hosted ? isHostedOrigin(value.APP_ORIGIN) : isLocalUrl(value.APP_ORIGIN, ["http:", "https:"], true)))
    context.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "Origin is not valid for the selected deployment mode" });
  if (!(hosted ? isAtlasUrl(value.MONGODB_URI) : isLocalUrl(value.MONGODB_URI, ["mongodb:"])))
    context.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "Database URL is not valid for the selected deployment mode" });
  if (hosted && value.YAMA_GRAPH_TARGET !== "cloud")
    context.addIssue({ code: "custom", path: ["YAMA_GRAPH_TARGET"], message: "Hosted demos require the cloud graph" });
});

export function parseServerConfig(environment: Record<string, string | undefined>) {
  const mode = environment.YAMA_DEPLOYMENT_MODE ?? "localhost";
  const hosted = mode === "hosted-demo";
  // Saved cloud aliases replace copied localhost values only after explicit hosted selection.
  // Explicit non-local values (including invalid ones) are validated rather than silently replaced.
  const origin = hosted && (!environment.APP_ORIGIN || isLocalUrl(environment.APP_ORIGIN, ["http:", "https:"], true))
    ? environment.YAMA_DEPLOYMENT_ORIGIN : environment.APP_ORIGIN;
  const mongoUri = hosted && (!environment.MONGODB_URI || isLocalUrl(environment.MONGODB_URI, ["mongodb:"]))
    ? environment.YAMA_CLOUD_MONGODB_URI : environment.MONGODB_URI;
  const parsed = configuration.safeParse({ ...environment, APP_ORIGIN: origin, MONGODB_URI: mongoUri,
    YAMA_DEPLOYMENT_MODE: mode, YAMA_GRAPH_TARGET: environment.YAMA_GRAPH_TARGET ?? "local" });
  if (!parsed.success) {
    // Never put database URLs, passwords, or malformed user values in logs.
    throw new BackendConfigurationError([...new Set(parsed.error.issues.map(issue => issue.path.join(".")))]);
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
    deploymentMode: parsed.data.YAMA_DEPLOYMENT_MODE,
    origin: new URL(parsed.data.APP_ORIGIN).origin,
    mongoUri: parsed.data.MONGODB_URI,
    mongoDatabase: parsed.data.MONGODB_DATABASE,
    graphTarget: parsed.data.YAMA_GRAPH_TARGET,
    ...graph,
    authSecret: parsed.data.BETTER_AUTH_SECRET,
  };
}

export const getServerConfig = () => parseServerConfig(process.env);
