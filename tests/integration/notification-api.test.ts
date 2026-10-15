import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { MongoClient, ObjectId } from "mongodb";
import { getServerConfig } from "@/server/config";
import { notificationSettings } from "@/server/notifications/config";
import { NotificationService } from "@/server/notifications/service";
import { NotificationWorker } from "@/server/notifications/worker";
import type { NotificationView } from "@/lib/notification";
import { anonymousSignIn } from "./anonymous-session";
process.loadEnvFile(".env.local");
const config = getServerConfig(),
  owners: string[] = [];
const mongo = new MongoClient(
  "mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true",
  {
    auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! },
    authSource: "admin",
  },
);
let cookieA: string,
  cookieB: string,
  reportId: string,
  preview: NotificationView;
const path = () => `/api/reports/${reportId}/notifications`;
async function call(
  route: string,
  cookie = cookieA,
  method = "GET",
  body?: unknown,
  origin = config.origin,
) {
  return fetch(config.origin + route, {
    method,
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signIn() {
  const response = await anonymousSignIn(config.origin);
  if (!response.ok) throw new Error("Synthetic session unavailable");
  owners.push((await response.json()).user.id);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
beforeAll(async () => {
  if (notificationSettings().live)
    throw new Error("Notification HTTP tests require fixture mode");
  cookieA = await signIn();
  cookieB = await signIn();
  const created = await call("/api/reports", cookieA, "POST", {
    synthetic: true,
    language: "hi",
    narrative: "Fictional private narration. Do not email this text.",
  });
  expect(created.status).toBe(201);
  reportId = (await created.json()).report._id;
});
afterAll(async () => {
  try {
    const db = mongo.db(config.mongoDatabase);
    for (const name of [
      "notification_jobs",
      "notification_recipients",
      "reports",
      "report_revisions",
      "graph_outbox",
    ])
      await db.collection(name).deleteMany({ ownerId: { $in: owners } });
    const ids = owners
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    for (const name of ["session", "account"])
      await db
        .collection(name)
        .deleteMany({ userId: { $in: [...owners, ...ids] } });
    await db.collection("user").deleteMany({ _id: { $in: ids } });
  } finally {
    await mongo.close();
  }
});
describe("authenticated notification approval and capture", () => {
  it("prepares the same private fixed preview without selecting addresses or exposing server state", async () => {
    const response = await call(path() + "/preview");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    preview = (await response.json()).notification;
    expect(preview).toMatchObject({
      status: "draft",
      provider: "fixture",
      recipient: {
        address: "preview@example.invalid",
        verification: "fixture",
      },
      deliveryConfirmed: false,
    });
    for (const field of [
      "ownerId",
      "configHash",
      "claimToken",
      "leaseUntil",
      "requestKey",
    ])
      expect(preview).not.toHaveProperty(field);
    expect(
      (await (await call(path() + "/preview")).json()).notification.id,
    ).toBe(preview.id);
    expect((await call(path() + "/preview?to=evil@example.com")).status).toBe(
      400,
    );
  });
  it("denies another account, missing sessions, forged content and untrusted origins", async () => {
    const input = {
      expectedRevision: 1,
      receipt: preview.receipt,
      key: randomUUID(),
      acknowledged: true,
      allowFallback: false,
    };
    for (const [suffix, method, body] of [
      ["/preview", "GET", undefined],
      ["", "GET", undefined],
      [`/${preview.id}`, "GET", undefined],
      [`/${preview.id}/approve`, "POST", input],
      [`/${preview.id}/cancel`, "POST", {}],
    ] as const) {
      expect((await call(path() + suffix, cookieB, method, body)).status).toBe(
        404,
      );
      expect((await call(path() + suffix, "", method, body)).status).toBe(401);
    }
    expect(
      (
        await call(
          `${path()}/${preview.id}/approve`,
          cookieA,
          "POST",
          input,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`${path()}/${preview.id}/approve`, cookieA, "POST", {
          ...input,
          to: "evil@example.com",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(`${path()}/${preview.id}/approve`, cookieA, "POST", {
          ...input,
          acknowledged: false,
        })
      ).status,
    ).toBe(400);
  });
  it("lets Disha prepare the real preview without approving or sending it", async () => {
    const result = await new Promise<{
      receipt: { status: string };
      preview: { id: string; status: string };
    }>((resolve, reject) => {
      const child = spawn(
        process.env.YAMA_TEST_PYTHON ?? "python3",
        ["-m", "scripts.agent_dispatcher_probe"],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let body = "";
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Notification probe timed out"));
      }, 25000);
      child.stdout.on("data", (chunk) => {
        body += String(chunk);
      });
      child.stderr.on("data", () => undefined);
      child.once("error", () => {
        clearTimeout(timeout);
        reject(new Error("Notification probe unavailable"));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) reject(new Error("Notification probe failed"));
        else
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Notification probe invalid"));
          }
      });
      child.stdin.end(
        JSON.stringify({
          origin: config.origin,
          cookie: cookieA,
          reportId,
          mode: "notification",
        }),
      );
    });
    expect(result.receipt.status).toBe("ready");
    expect(result.preview).toMatchObject({ id: preview.id, status: "draft" });
  });
  it("captures only after explicit approval, survives replay and leaves the report unconfirmed", async () => {
    const input = {
      expectedRevision: 1,
      receipt: preview.receipt,
      key: randomUUID(),
      acknowledged: true,
      allowFallback: false,
    };
    const response = await call(
      `${path()}/${preview.id}/approve`,
      cookieA,
      "POST",
      input,
    );
    expect(response.status).toBe(202);
    await new NotificationWorker(
      new NotificationService(mongo.db(config.mongoDatabase), mongo),
    ).runOnce();
    expect(
      (await (await call(`${path()}/${preview.id}`)).json()).notification,
    ).toMatchObject({
      status: "captured",
      provider: "fixture",
      deliveryConfirmed: false,
    });
    expect(
      (
        await (
          await call(`${path()}/${preview.id}/approve`, cookieA, "POST", input)
        ).json()
      ).notification.status,
    ).toBe("captured");
    expect(
      (await (await call(`/api/reports/${reportId}`)).json()).report,
    ).toMatchObject({ revision: 1, confirmation: null });
  });
});
