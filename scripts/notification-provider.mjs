import { pathToFileURL } from "node:url";
import { z } from "zod";
const address = z
  .email()
  .max(254)
  .refine((value) => !/[\r\n<>\s]/.test(value));
const payloadSchema = z.strictObject({
  id: z.uuid(),
  from: address,
  to: address,
  replyTo: address.nullable(),
  subject: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => !/[\r\n]/.test(value)),
  text: z.string().min(1).max(4000),
  html: z.string().min(1).max(8000),
});
const unknown = () => ({
  outcome: "delivery_unknown",
  code: "transport_uncertain",
});
export function gmailTransportOptions(credentials) {
  return {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    pool: false,
    logger: false,
    debug: false,
    proxy: undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    dnsTimeout: 3000,
    tls: { rejectUnauthorized: true, servername: "smtp.gmail.com" },
    disableFileAccess: true,
    disableUrlAccess: true,
    auth:
      credentials.auth === "app_password"
        ? { user: credentials.user, pass: credentials.password }
        : {
            type: "OAuth2",
            user: credentials.user,
            accessToken: credentials.accessToken,
          },
  };
}
export async function executeNotificationSDK(
  provider,
  input,
  credentials,
  transport = {},
) {
  const payload = payloadSchema.parse(input),
    messageId = `<yama.${payload.id}@${payload.from.split("@")[1]}>`;
  if (provider === "resend") {
    let calls = 0,
      httpStatus = null,
      preconnectionFailure = false;
    const fetch = transport.fetch ?? globalThis.fetch;
    const original = globalThis.fetch;
    globalThis.fetch = async (value, options) => {
      if (
        ++calls > 1 ||
        String(value) !== "https://api.resend.com/emails" ||
        options.method !== "POST"
      )
        throw new Error("mail_destination_rejected");
      let response;
      try {
        response = await fetch(value, {
          ...options,
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
      } catch (error) {
        preconnectionFailure = ["ECONNREFUSED", "ENOTFOUND"].includes(
          error?.cause?.code,
        );
        throw error;
      }
      httpStatus = response.status;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("mail_response_invalid");
      const chunks = [];
      let bytes = 0;
      while (true) {
        const packet = await reader.read();
        if (packet.done) break;
        bytes += packet.value.byteLength;
        if (bytes > 32768) {
          await reader.cancel();
          throw new Error("mail_response_limit");
        }
        chunks.push(packet.value);
      }
      return new Response(Buffer.concat(chunks), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const { Resend } = await import("resend");
      const client = new Resend(credentials.resendKey, {
        baseUrl: "https://api.resend.com",
      });
      const output = await client.emails.send(
        {
          from: `Yama <${payload.from}>`,
          to: [payload.to],
          replyTo: payload.replyTo ?? undefined,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          headers: { "Message-ID": messageId },
        },
        { idempotencyKey: `yama-mail/${payload.id}` },
      );
      if (
        httpStatus === 200 &&
        z.uuid().safeParse(output.data?.id).success &&
        !output.error
      )
        return { outcome: "accepted", providerRef: output.data.id };
      if (preconnectionFailure)
        return { outcome: "not_accepted", code: "connection_unavailable" };
      if (
        httpStatus !== null &&
        [400, 401, 403, 404, 405, 422, 429].includes(httpStatus)
      )
        return { outcome: "rejected", code: "provider_rejected" };
      return unknown();
    } catch {
      return preconnectionFailure
        ? { outcome: "not_accepted", code: "connection_unavailable" }
        : unknown();
    } finally {
      globalThis.fetch = original;
    }
  }
  if (
    provider !== "gmail" ||
    payload.from !== credentials.user ||
    !credentials.user?.endsWith("@gmail.com")
  )
    return unknown();
  const { default: nodemailer } = await import("nodemailer");
  const options = gmailTransportOptions(credentials),
    client = transport.createSMTP
      ? transport.createSMTP(options)
      : nodemailer.createTransport(options);
  try {
    const result = await client.sendMail({
      from: `Yama <${payload.from}>`,
      to: payload.to,
      replyTo: payload.replyTo ?? undefined,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      messageId,
      envelope: { from: payload.from, to: [payload.to] },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (
      result.accepted?.length === 1 &&
      String(result.accepted[0]).toLowerCase() === payload.to.toLowerCase() &&
      !result.rejected?.length
    )
      return { outcome: "accepted", providerRef: messageId };
    return result.rejected?.length === 1
      ? { outcome: "rejected", code: "provider_rejected" }
      : unknown();
  } catch (error) {
    return error?.code === "EENVELOPE" &&
      error?.command === "RCPT TO" &&
      error?.responseCode >= 500 &&
      error?.responseCode < 600
      ? { outcome: "rejected", code: "provider_rejected" }
      : unknown();
  } finally {
    client.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log = console.warn = console.info = console.error = () => undefined;
  try {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.YAMA_DEMO_ONLY !== "true" ||
      process.env.YAMA_MAIL_LIVE_ENABLED !== "true" ||
      process.env.YAMA_MAIL_DATA_POLICY_ACKNOWLEDGED !== "true"
    )
      throw new Error("mail_disabled");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 16000) throw new Error("mail_input_limit");
      chunks.push(chunk);
    }
    const result = await executeNotificationSDK(
      process.argv[2],
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
      {
        resendKey: process.env.RESEND_API_KEY,
        user: process.env.GMAIL_USER,
        auth: process.env.YAMA_MAIL_GMAIL_AUTH,
        accessToken: process.env.GMAIL_ACCESS_TOKEN,
        password: process.env.GMAIL_APP_PASSWORD,
      },
    );
    process.stdout.write(JSON.stringify(result));
  } catch {
    process.stdout.write(JSON.stringify(unknown()));
  }
}
