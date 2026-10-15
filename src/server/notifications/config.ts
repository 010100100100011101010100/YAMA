import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
const address = z
  .email()
  .max(254)
  .refine((value) => !/[\r\n<>\s]/.test(value));
export function notificationSettings(
  environment: Record<string, string | undefined> = process.env,
) {
  const base = z
    .object({
      YAMA_DEMO_ONLY: z.literal("true"),
      YAMA_MAIL_PROVIDER: z.enum(["fixture", "resend"]).default("fixture"),
      YAMA_MAIL_MAX_ATTEMPTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10),
    })
    .safeParse(environment);
  if (!base.success) throw new ServiceError(503, "mail_not_configured");
  const live = base.data.YAMA_MAIL_PROVIDER === "resend",
    fallback = live && environment.YAMA_MAIL_FALLBACK_ENABLED === "true";
  if (
    live &&
    (environment.YAMA_MAIL_LIVE_ENABLED !== "true" ||
      environment.YAMA_MAIL_DATA_POLICY_ACKNOWLEDGED !== "true" ||
      environment.YAMA_MAIL_RESEND_DOMAIN_VERIFIED !== "true" ||
      (environment.RESEND_API_KEY?.trim().length ?? 0) < 8 ||
      !address.safeParse(environment.YAMA_MAIL_FROM).success)
  )
    throw new ServiceError(503, "mail_not_configured");
  const from = live
    ? environment.YAMA_MAIL_FROM!
    : "notifications@example.invalid";
  if (
    live &&
    ["gmail.com", "googlemail.com", "outlook.com", "resend.dev"].includes(
      from.split("@")[1].toLowerCase(),
    )
  )
    throw new ServiceError(503, "mail_not_configured");
  const auth = environment.YAMA_MAIL_GMAIL_AUTH ?? "oauth2";
  if (
    fallback &&
    (!address.safeParse(environment.GMAIL_USER).success ||
      !environment.GMAIL_USER?.toLowerCase().endsWith("@gmail.com") ||
      !["oauth2", "app_password"].includes(auth) ||
      (auth === "oauth2"
        ? (environment.GMAIL_ACCESS_TOKEN?.length ?? 0) < 16
        : (environment.GMAIL_APP_PASSWORD?.replaceAll(" ", "").length ?? 0) <
          16))
  )
    throw new ServiceError(503, "mail_not_configured");
  if (
    environment.YAMA_MAIL_REPLY_TO &&
    !address.safeParse(environment.YAMA_MAIL_REPLY_TO).success
  )
    throw new ServiceError(503, "mail_not_configured");
  return {
    live,
    fallbackEnabled: fallback,
    maxAttempts: base.data.YAMA_MAIL_MAX_ATTEMPTS,
    from,
    replyTo: environment.YAMA_MAIL_REPLY_TO || null,
    resendKey: live ? environment.RESEND_API_KEY! : "",
    gmailUser: fallback ? environment.GMAIL_USER!.toLowerCase() : "",
    gmailAuth: auth as "oauth2" | "app_password",
    gmailAccessToken:
      fallback && auth === "oauth2" ? environment.GMAIL_ACCESS_TOKEN! : "",
    gmailAppPassword:
      fallback && auth === "app_password"
        ? environment.GMAIL_APP_PASSWORD!.replaceAll(" ", "")
        : "",
  };
}
export type NotificationSettings = ReturnType<typeof notificationSettings>;
export const notificationConfigHash = (
  settings: NotificationSettings,
  origin: string,
) =>
  createHash("sha256")
    .update(JSON.stringify({ version: "mail-v1", ...settings, origin }))
    .digest("hex");
