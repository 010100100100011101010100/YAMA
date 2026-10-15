import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  executeNotificationSDK,
  gmailTransportOptions,
} from "./notification-provider.mjs";
const mode = process.argv[2],
  id = randomUUID(),
  payload = {
    id,
    from: "notifications@example.com",
    to: "operator@example.com",
    replyTo: null,
    subject: "Your Yama workspace",
    text: "काल्पनिक localhost test.",
    html: '<html lang="hi"><body>काल्पनिक localhost test.</body></html>',
  };
let calls = 0;
if (mode.startsWith("resend")) {
  const fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.get("Idempotency-Key"), `yama-mail/${id}`);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, [payload.to]);
    assert.equal(body.text, payload.text);
    assert.equal(body.html, payload.html);
    assert.equal(body.headers["Message-ID"], `<yama.${id}@example.com>`);
    for (const name of ["attachments", "bcc", "cc", "scheduled_at", "tags"])
      assert.equal(body[name], undefined);
    if (mode === "resend-refused" || mode === "resend-reset") {
      const error = new Error("Fake transport error");
      error.cause = {
        code: mode === "resend-refused" ? "ECONNREFUSED" : "ECONNRESET",
      };
      throw error;
    }
    if (mode === "resend-large")
      return new Response("x".repeat(32769), { status: 200 });
    return new Response(
      JSON.stringify(
        mode === "resend-accepted"
          ? { id }
          : { name: "service_unavailable", message: "Fake provider body" },
      ),
      {
        status:
          mode === "resend-accepted"
            ? 200
            : mode === "resend-rejected"
              ? 403
              : 503,
      },
    );
  };
  const output = await executeNotificationSDK(
    "resend",
    payload,
    { resendKey: "fake-resend-key" },
    { fetch },
  );
  assert.equal(
    output.outcome,
    mode === "resend-accepted"
      ? "accepted"
      : mode === "resend-refused"
        ? "not_accepted"
        : mode === "resend-rejected"
          ? "rejected"
          : "delivery_unknown",
  );
  assert.equal(JSON.stringify(output).includes("Fake provider body"), false);
} else {
  const { default: nodemailer } = await import("nodemailer");
  const stream = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  let rendered;
  const credentials = {
    user: "yama.fixture@gmail.com",
    auth: "app_password",
    password: "fakeapppassword1",
  };
  payload.from = credentials.user;
  const createSMTP = (options) => {
    assert.equal(options.host, "smtp.gmail.com");
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.equal(options.pool, false);
    assert.equal(options.tls.rejectUnauthorized, true);
    assert.equal(options.disableFileAccess, true);
    assert.equal(options.disableUrlAccess, true);
    assert.equal(options.logger, false);
    assert.equal(options.debug, false);
    assert.equal(options.socketTimeout, 5000);
    return {
      async sendMail(message) {
        calls++;
        assert.deepEqual(message.envelope, {
          from: credentials.user,
          to: [payload.to],
        });
        for (const name of ["attachments", "bcc", "cc", "raw"])
          assert.equal(message[name], undefined);
        if (mode === "gmail-reset") {
          const error = new Error("Fake ambiguous timeout");
          error.code = "ETIMEDOUT";
          throw error;
        }
        rendered = (await stream.sendMail(message)).message;
        return mode === "gmail-no-ack"
          ? {}
          : { accepted: [payload.to], rejected: [] };
      },
      close() {
        stream.close();
      },
    };
  };
  const output = await executeNotificationSDK("gmail", payload, credentials, {
    createSMTP,
  });
  assert.equal(
    output.outcome,
    mode === "gmail-accepted" ? "accepted" : "delivery_unknown",
  );
  if (rendered) {
    const raw = rendered.toString();
    assert.match(raw, /Content-Type: text\/plain; charset=utf-8/i);
    assert.match(raw, /Content-Type: text\/html; charset=utf-8/i);
    assert.match(raw, /Message-ID: <yama\./);
    assert.doesNotMatch(raw, /Content-Disposition: attachment|Bcc:|Cc:/);
  }
  const oauth = gmailTransportOptions({
    user: credentials.user,
    auth: "oauth2",
    accessToken: "fake-access-token",
  });
  assert.equal(oauth.auth.type, "OAuth2");
  assert.equal(oauth.auth.refreshToken, undefined);
}
assert.equal(calls, 1);
process.stdout.write(
  JSON.stringify({ passed: true, requests: 1, network: false }),
);
