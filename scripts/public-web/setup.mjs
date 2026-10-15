import { chmod, readFile, writeFile } from "node:fs/promises";
const path = ".env.local";
const contents = await readFile(path, "utf8");
const defaults = {
  YAMA_PUBLIC_WEB_PROVIDER: "fixture",
  YAMA_PUBLIC_WEB_LIVE_ENABLED: "false",
  YAMA_PUBLIC_WEB_DATA_POLICY_ACKNOWLEDGED: "false",
  EXA_API_KEY: "",
  FIRECRAWL_API_KEY: "",
  YAMA_PUBLIC_WEB_MAX_SEARCHES: "10",
  YAMA_PUBLIC_WEB_MAX_PAGES: "15",
  YAMA_PUBLIC_WEB_MAX_EXA_MICRO_USD: "100000",
  YAMA_PUBLIC_WEB_MAX_FIRECRAWL_CREDITS: "50",
};
let updated = contents;
for (const [key, value] of Object.entries(defaults))
  if (!new RegExp(`^${key}=`, "m").test(contents))
    updated += `\n${key}=${value}`;
await writeFile(path, updated.trimEnd() + "\n", { mode: 0o600 });
await chmod(path, 0o600);
console.log(
  "Public lookup defaults prepared; existing values preserved. No credentials were printed.",
);
