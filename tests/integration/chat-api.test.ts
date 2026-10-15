import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { getServerConfig } from "@/server/config";
import { anonymousSignIn } from "./anonymous-session";
process.loadEnvFile(".env.local");
const config = getServerConfig(),
  owners: string[] = [],
  mongo = new MongoClient(
    "mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true",
    {
      auth: {
        username: "yama_root",
        password: process.env.MONGO_ROOT_PASSWORD!,
      },
      authSource: "admin",
    },
  );
let cookieA: string, cookieB: string, id: string;
async function call(
  path: string,
  cookie = cookieA,
  method = "GET",
  body?: unknown,
  origin = config.origin,
) {
  return fetch(config.origin + path, {
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
  const result = await anonymousSignIn(config.origin);
  if (!result.ok) throw new Error("Synthetic session unavailable");
  owners.push((await result.json()).user.id);
  return result.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
beforeAll(async () => {
  cookieA = await signIn();
  cookieB = await signIn();
  const created = await call("/api/reports", cookieA, "POST", {
    synthetic: true,
    language: "en",
    narrative: "Fictional sidebar chat.",
  });
  expect(created.status).toBe(201);
  id = (await created.json()).report._id;
});
afterAll(async () => {
  try {
    const db = mongo.db(config.mongoDatabase);
    for (const name of [
      "reports",
      "report_revisions",
      "graph_outbox",
      "chat_statuses",
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
describe("owned sidebar and resolution HTTP", () => {
  it("lists a bounded title and unresolved status without private server fields", async () => {
    const result = await call("/api/reports");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    const chat = (await result.json()).reports.find(
      (row: { _id: string }) => row._id === id,
    );
    expect(chat).toMatchObject({
      title: "Fictional sidebar chat.",
      resolution: "unresolved",
      statusVersion: 0,
    });
    for (const field of ["ownerId", "messages", "creationKey"])
      expect(chat).not.toHaveProperty(field);
    expect(
      (await (await call("/api/reports", cookieB)).json()).reports,
    ).toEqual([]);
  });
  it("persists resolution and reopening without resolving confirmed notes automatically", async () => {
    const path = `/api/reports/${id}/chat-status`;
    expect((await (await call(path)).json()).status.resolution).toBe(
      "unresolved",
    );
    expect(
      (
        await call(path, cookieA, "PATCH", {
          resolution: "resolved",
          expectedVersion: 0,
        })
      ).status,
    ).toBe(200);
    expect((await (await call(path)).json()).status).toMatchObject({
      resolution: "resolved",
      version: 1,
    });
    expect(
      (await (await call(`/api/reports/${id}`)).json()).report,
    ).toMatchObject({ revision: 1, confirmation: null });
    expect(
      (
        await call(path, cookieA, "PATCH", {
          resolution: "unresolved",
          expectedVersion: 1,
        })
      ).status,
    ).toBe(200);
  });
  it("rejects foreign accounts, missing sessions and wrong mutation origins", async () => {
    const path = `/api/reports/${id}/chat-status`,
      input = { resolution: "resolved", expectedVersion: 2 };
    expect((await call(path, cookieB)).status).toBe(404);
    expect((await call(path, "")).status).toBe(401);
    expect((await call(path, cookieB, "PATCH", input)).status).toBe(404);
    expect(
      (await call(path, cookieA, "PATCH", input, "https://evil.example"))
        .status,
    ).toBe(403);
  });
});
