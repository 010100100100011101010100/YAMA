import "server-only";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { NotificationSettings } from "./config";
import type { NotificationRecord } from "./records";
export const notificationOutcomeSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("accepted"),
    providerRef: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9.@<>_-]+$/),
  }),
  z.strictObject({
    outcome: z.literal("captured"),
    providerRef: z.string().min(1).max(128),
  }),
  z.strictObject({
    outcome: z.literal("not_accepted"),
    code: z.literal("connection_unavailable"),
  }),
  z.strictObject({
    outcome: z.literal("rejected"),
    code: z.literal("provider_rejected"),
  }),
  z.strictObject({
    outcome: z.literal("delivery_unknown"),
    code: z.literal("transport_uncertain"),
  }),
]);
export type NotificationOutcome = z.infer<typeof notificationOutcomeSchema>;
export type NotificationPayload = {
  id: string;
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  text: string;
  html: string;
};
export type NotificationRunner = (
  provider: "resend" | "gmail",
  payload: NotificationPayload,
  settings: NotificationSettings,
  signal: AbortSignal,
) => Promise<unknown>;
export function notificationPayload(
  record: NotificationRecord,
): NotificationPayload {
  return {
    id: record._id,
    from: record.provider === "gmail" ? record.fallbackFrom! : record.from,
    to: record.recipient.address,
    replyTo: record.replyTo,
    ...record.content,
  };
}
export const runNotification: NotificationRunner = (
  provider,
  payload,
  settings,
  signal,
) =>
  new Promise((resolve, reject) => {
    if (process.env.NODE_ENV === "test" || !settings.live || signal.aborted) {
      reject(new Error("mail_transport_disabled"));
      return;
    }
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      NODE_ENV: process.env.NODE_ENV,
      YAMA_DEMO_ONLY: "true",
      YAMA_MAIL_LIVE_ENABLED: "true",
      YAMA_MAIL_DATA_POLICY_ACKNOWLEDGED: "true",
      ...(provider === "resend"
        ? { RESEND_API_KEY: settings.resendKey }
        : {
            GMAIL_USER: settings.gmailUser,
            YAMA_MAIL_GMAIL_AUTH: settings.gmailAuth,
            GMAIL_ACCESS_TOKEN: settings.gmailAccessToken,
            GMAIL_APP_PASSWORD: settings.gmailAppPassword,
          }),
    };
    const child = spawn(
      process.execPath,
      ["scripts/notification-provider.mjs", provider],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let body = "",
      failed = false;
    const stop = () => {
      failed = true;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(stop, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    child.stdout.on("data", (chunk) => {
      body += String(chunk);
      if (Buffer.byteLength(body) > 2048) stop();
    });
    child.stderr.on("data", () => undefined);
    child.stdin.on("error", stop);
    child.once("error", () => {
      cleanup();
      reject(new Error("mail_transport_unavailable"));
    });
    child.once("close", (code) => {
      cleanup();
      if (failed || code !== 0) {
        reject(new Error("mail_transport_uncertain"));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("mail_transport_invalid"));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
