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
const configuration = z.object({
  YAMA_DEMO_ONLY: z.literal("true"),
  APP_ORIGIN: z.url().refine(value => isLocalUrl(value, ["http:", "https:"], true)),
  MONGODB_URI: z.string().refine(value => isLocalUrl(value, ["mongodb:"])),
  MONGODB_DATABASE: z.string().regex(/^yama[a-z0-9_]{0,45}$/),
  FALKORDB_HOST: z.string().refine(isLoopback),
  FALKORDB_PORT: z.coerce.number().int().min(1024).max(65535),
  FALKORDB_PASSWORD: z.string().min(16),
  BETTER_AUTH_SECRET: z.string().min(32),
});

export function parseServerConfig(environment: Record<string, string | undefined>) {
  const parsed = configuration.safeParse(environment);
  if (!parsed.success) {
    // Never put database URLs, passwords, or malformed user values in logs.
    throw new Error(`Invalid backend configuration: ${parsed.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
  }
  return {
    origin: new URL(parsed.data.APP_ORIGIN).origin,
    mongoUri: parsed.data.MONGODB_URI,
    mongoDatabase: parsed.data.MONGODB_DATABASE,
    graphHost: parsed.data.FALKORDB_HOST,
    graphPort: parsed.data.FALKORDB_PORT,
    graphPassword: parsed.data.FALKORDB_PASSWORD,
    authSecret: parsed.data.BETTER_AUTH_SECRET,
  };
}

export const getServerConfig = () => parseServerConfig(process.env);
