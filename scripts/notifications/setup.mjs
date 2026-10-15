import { readFile, writeFile, chmod } from "node:fs/promises";
const path = ".env.local",
  contents = await readFile(path, "utf8");
const defaults = {
  YAMA_MAIL_PROVIDER: "fixture",
  YAMA_MAIL_LIVE_ENABLED: "false",
  YAMA_MAIL_DATA_POLICY_ACKNOWLEDGED: "false",
  YAMA_MAIL_RESEND_DOMAIN_VERIFIED: "false",
  YAMA_MAIL_MAX_ATTEMPTS: "10",
  RESEND_API_KEY: "",
  YAMA_MAIL_FROM: "",
  YAMA_MAIL_REPLY_TO: "",
  YAMA_MAIL_FALLBACK_ENABLED: "false",
  YAMA_MAIL_GMAIL_AUTH: "oauth2",
  GMAIL_USER: "",
  GMAIL_ACCESS_TOKEN: "",
  GMAIL_APP_PASSWORD: "",
};
let updated = contents;
for (const [key, value] of Object.entries(defaults))
  if (!new RegExp(`^${key}=`, "m").test(contents))
    updated += `\n${key}=${value}`;
await writeFile(path, updated.trimEnd() + "\n", { mode: 0o600 });
await chmod(path, 0o600);
console.log(
  "Notification defaults prepared; existing settings preserved. No credentials were printed.",
);
