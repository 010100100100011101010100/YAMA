import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { MongoClient, ObjectId } from "mongodb";
import { getServerConfig } from "@/server/config";
import { PublicWebService } from "@/server/public-web/service";
import { PublicWebWorker } from "@/server/public-web/worker";
import { publicWebSettings } from "@/server/public-web/config";
import type { PublicWebView } from "@/lib/public-web";
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
  searchJob: PublicWebView;
const path = () => `/api/reports/${reportId}/public-web`;
const command = () => ({
  operation: "search_public_web",
  expectedRevision: 1,
  agent: "disha",
  topic: "consumer_reporting",
  reason: "public_source_requested",
  key: randomUUID(),
});
async function call(
  route: string,
  cookie = cookieA,
  method = "GET",
  body?: unknown,
  origin = config.origin,
) {
  return fetch(`${config.origin}${route}`, {
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
  if (publicWebSettings().live)
    throw new Error("HTTP public lookup tests require fixture mode");
  cookieA = await signIn();
  cookieB = await signIn();
  const created = await call("/api/reports", cookieA, "POST", {
    synthetic: true,
    language: "en",
    narrative:
      "Fictional private test: do not send this narration to a provider.",
  });
  expect(created.status).toBe(201);
  reportId = (await created.json()).report._id;
});
afterAll(async () => {
  try {
    const db = mongo.db(config.mongoDatabase);
    for (const name of [
      "public_web_jobs",
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
describe("authenticated public lookup routes and Python gateway", () => {
  it("creates a private replayable receipt without exposing credentials or control fields", async () => {
    const input = command(),
      response = await call(path(), cookieA, "POST", input);
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    searchJob = (await response.json()).job;
    expect(searchJob).toMatchObject({
      status: "queued",
      localGuidance: { free: true },
      adapter: { provider: "fixture", live: false },
    });
    for (const field of [
      "ownerId",
      "requestKey",
      "claimToken",
      "configHash",
      "command",
    ])
      expect(searchJob).not.toHaveProperty(field);
    expect(
      (await (await call(path(), cookieA, "POST", input)).json()).job.id,
    ).toBe(searchJob.id);
  });
  it("rejects foreign ownership, expired authentication, unsafe arguments and origins", async () => {
    for (const [suffix, method, body] of [
      ["", "GET", undefined],
      ["", "POST", command()],
      [`/${searchJob.id}`, "GET", undefined],
      [`/${searchJob.id}/cancel`, "POST", {}],
    ] as const) {
      expect((await call(path() + suffix, cookieB, method, body)).status).toBe(
        404,
      );
      expect((await call(path() + suffix, "", method, body)).status).toBe(401);
    }
    expect(
      (await call(path(), cookieA, "POST", { ...command(), query: "private" }))
        .status,
    ).toBe(400);
    expect(
      (await call(path(), cookieA, "POST", { ...command(), agent: "saathi" }))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          path(),
          cookieA,
          "POST",
          command(),
          "https://attacker.invalid",
        )
      ).status,
    ).toBe(403);
  });
  it("retrieves an authored result through the real Python dispatcher with no report writes", async () => {
    const worker = new PublicWebWorker(
      new PublicWebService(mongo.db(config.mongoDatabase), mongo),
    );
    await worker.runOnce();
    searchJob = (await (await call(`${path()}/${searchJob.id}`)).json()).job;
    expect(searchJob.status).toBe("ready");
    const result = await new Promise<{
      receipt: { status: string };
      preview: { kind: string };
      error?: unknown;
    }>((resolve, reject) => {
      const child = spawn(
        process.env.YAMA_TEST_PYTHON ?? "python3",
        ["-m", "scripts.agent_dispatcher_probe"],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let content = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Private probe timed out"));
      }, 25000);
      child.stdout.on("data", (chunk) => {
        content += String(chunk);
      });
      child.stderr.on("data", () => undefined);
      child.once("error", () => {
        clearTimeout(timer);
        reject(new Error("Private probe unavailable"));
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error("Private probe failed"));
        else
          try {
            resolve(JSON.parse(content));
          } catch {
            reject(new Error("Private probe invalid"));
          }
      });
      child.stdin.end(
        JSON.stringify({
          origin: config.origin,
          cookie: cookieA,
          reportId,
          mode: "public_web",
        }),
      );
    });
    expect(result.error).toBeUndefined();
    expect(result.receipt).toMatchObject({ status: "ready", errorCode: null });
    expect(result.preview.kind).toBe("search");
    expect(
      (await (await call(`/api/reports/${reportId}`)).json()).report,
    ).toMatchObject({ revision: 1, confirmation: null });
  });
  it("fetches a selected authored page and revokes children when the parent is canceled", async () => {
    if (searchJob.result?.kind !== "search")
      throw new Error("Fixture source missing");
    const input = {
      operation: "fetch_public_page",
      expectedRevision: 1,
      agent: "drishti",
      key: randomUUID(),
      searchId: searchJob.id,
      sourceId: searchJob.result.sources[0].id,
    };
    const created = await call(path(), cookieA, "POST", input);
    expect(created.status).toBe(202);
    const page = (await created.json()).job;
    await new PublicWebWorker(
      new PublicWebService(mongo.db(config.mongoDatabase), mongo),
    ).runOnce();
    expect(
      (await (await call(`${path()}/${page.id}`)).json()).job.result,
    ).toMatchObject({
      kind: "page",
      contentIsUntrusted: true,
      verification: "authored_fixture",
    });
    expect(
      (await call(`${path()}/${searchJob.id}/cancel`, cookieA, "POST", {}))
        .status,
    ).toBe(200);
    expect(
      (await (await call(`${path()}/${page.id}`)).json()).job,
    ).toMatchObject({ status: "canceled", result: null });
  });
});
