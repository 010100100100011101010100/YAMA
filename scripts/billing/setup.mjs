import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const path = ".env.local",
  contents = await readFile(path, "utf8");
const defaults = {
  YAMA_BILLING_PROVIDER: "fixture",
  YAMA_DODO_TEST_ENABLED: "false",
  YAMA_DODO_DATA_POLICY_ACKNOWLEDGED: "false",
  YAMA_BILLING_MAX_API_CALLS: "50",
  YAMA_BILLING_FIXTURE_WEBHOOK_KEY:
    "whsec_" + randomBytes(32).toString("base64"),
  DODO_PAYMENTS_API_KEY: "",
  DODO_PAYMENTS_WEBHOOK_KEY: "",
  DODO_PAYMENTS_PRODUCT_ID: "",
  DODO_PAYMENTS_BUSINESS_ID: "",
};
let updated = contents;
for (const [key, value] of Object.entries(defaults)) {
  if (!new RegExp(`^${key}=`, "m").test(contents))
    updated += `\n${key}=${value}`;
  else if (
    key === "YAMA_BILLING_FIXTURE_WEBHOOK_KEY" &&
    new RegExp(`^${key}=\\s*$`, "m").test(contents)
  )
    updated = updated.replace(
      new RegExp(`^${key}=\\s*$`, "m"),
      `${key}=${value}`,
    );
}
await writeFile(path, updated.trimEnd() + "\n", { mode: 0o600 });
await chmod(path, 0o600);
console.log(
  "Billing fixture defaults prepared. Existing settings preserved; no credentials printed.",
);
