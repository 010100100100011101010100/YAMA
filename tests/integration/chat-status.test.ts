import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { ReportRepository } from "@/server/reports/repository";
import { ChatService } from "@/server/reports/chats";
process.loadEnvFile(".env.local");
const namespace = `yama_chats_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
let client: MongoClient, db: Db, reports: ReportRepository, chats: ChatService;
beforeAll(async () => {
  client = new MongoClient(
    "mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true",
    {
      auth: {
        username: "yama_root",
        password: process.env.MONGO_ROOT_PASSWORD!,
      },
      authSource: "admin",
    },
  );
  await client.connect();
  db = client.db(namespace);
  await initializeSchema(db);
  reports = new ReportRepository(db, client);
  chats = new ChatService(db);
});
afterAll(async () => {
  if (client) {
    await client.db(namespace).dropDatabase();
    await client.close();
  }
});
describe("user controlled chat resolution", () => {
  it("defaults old chats to unresolved and derives an owned bounded title", async () => {
    const report = await reports.create(
      "owner-a",
      {
        synthetic: true,
        language: "hi",
        narrative: "  एक काल्पनिक\n बातचीत।  ",
      },
      randomUUID(),
    );
    expect(await chats.get("owner-a", report._id)).toEqual({
      reportId: report._id,
      resolution: "unresolved",
      version: 0,
    });
    expect((await chats.list("owner-a"))[0]).toMatchObject({
      _id: report._id,
      title: "एक काल्पनिक बातचीत।",
      resolution: "unresolved",
      statusVersion: 0,
    });
    expect(await chats.list("owner-b")).toEqual([]);
  });
  it("marks and reopens without changing assertions, revision or confirmation", async () => {
    const report = await reports.create(
      "owner-a",
      { synthetic: true, language: "en", narrative: "Fictional account." },
      randomUUID(),
    );
    await reports.confirm("owner-a", report._id, {
      expectedRevision: 1,
      acknowledged: true,
    });
    expect(
      await chats.change("owner-a", report._id, {
        resolution: "resolved",
        expectedVersion: 0,
      }),
    ).toMatchObject({ resolution: "resolved", version: 1 });
    expect(
      await chats.change("owner-a", report._id, {
        resolution: "resolved",
        expectedVersion: 0,
      }),
    ).toMatchObject({ version: 1 });
    expect(
      (await reports.get("owner-a", report._id)).confirmation?.revision,
    ).toBe(1);
    expect(
      await chats.change("owner-a", report._id, {
        resolution: "unresolved",
        expectedVersion: 1,
      }),
    ).toMatchObject({ resolution: "unresolved", version: 2 });
    await expect(
      chats.change("owner-a", report._id, {
        resolution: "resolved",
        expectedVersion: 0,
      }),
    ).rejects.toThrow("chat_status_conflict");
  });
  it("rejects foreign accounts and extra fields", async () => {
    const report = await reports.create(
      "owner-a",
      { synthetic: true, language: "en", narrative: "Fictional ownership." },
      randomUUID(),
    );
    await expect(chats.get("owner-b", report._id)).rejects.toThrow(
      "report_not_found",
    );
    await expect(
      chats.change("owner-b", report._id, {
        resolution: "resolved",
        expectedVersion: 0,
      }),
    ).rejects.toThrow("report_not_found");
    await expect(
      chats.change("owner-a", report._id, {
        resolution: "resolved",
        expectedVersion: 0,
        ownerId: "owner-b",
      }),
    ).rejects.toThrow("invalid_request");
  });
});
