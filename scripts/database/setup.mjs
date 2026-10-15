import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";

try {
  await access(".env.local");
  console.log("Existing .env.local preserved. Check .env.example for required backend settings.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const secret = () => randomBytes(32).toString("hex");
  const appPassword = secret();
  const environment = {
    YAMA_DEMO_ONLY: "true", APP_ORIGIN: "http://127.0.0.1:3000",
    MONGODB_URI: `mongodb://yama:${appPassword}@127.0.0.1:27018/yama?authSource=yama&replicaSet=yama-rs&directConnection=true`,
    MONGODB_DATABASE: "yama", MONGO_ROOT_PASSWORD: secret(), MONGO_APP_PASSWORD: appPassword,
    FALKORDB_HOST: "127.0.0.1", FALKORDB_PORT: "6380", FALKORDB_PASSWORD: secret(), BETTER_AUTH_SECRET: secret(),
  };
  await writeFile(".env.local", Object.entries(environment).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
  console.log("Generated ignored localhost configuration and random secrets in .env.local.");
}
await mkdir(".local/secrets", { recursive: true });
try {
  await writeFile(".local/secrets/mongo-key", randomBytes(64).toString("base64"), { mode: 0o600, flag: "wx" });
} catch (error) { if (error.code !== "EEXIST") throw error; }
