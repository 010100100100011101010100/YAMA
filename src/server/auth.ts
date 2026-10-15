import "server-only";
import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { anonymous } from "better-auth/plugins";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { getServerConfig } from "@/server/config";

function createAuth() {
  const configuration = getServerConfig();
  return betterAuth({
    logger: { disabled: true },
    database: mongodbAdapter(getDatabase(), { client: getMongoClient() }),
    secret: configuration.authSecret,
    baseURL: configuration.origin,
    trustedOrigins: [configuration.origin],
    plugins: [anonymous({ disableDeleteAnonymousUser: true })],
    session: { expiresIn: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    advanced: { cookies: { session_token: { attributes: { httpOnly: true, sameSite: "lax" } } } },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  auth ??= createAuth();
  return auth;
}
