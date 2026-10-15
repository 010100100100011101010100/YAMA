import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { ReportRepository } from "@/server/reports/repository";
import type { Report } from "@/server/reports/domain";
import { NotificationService } from "@/server/notifications/service";
import { NotificationWorker } from "@/server/notifications/worker";
import { notificationSettings } from "@/server/notifications/config";
import type { NotificationRunner } from "@/server/notifications/runtime";
import type { NotificationRecord } from "@/server/notifications/records";
process.loadEnvFile(".env.local");
const namespace = `yama_mail_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
let client: MongoClient,
  db: Db,
  report: Report,
  service: NotificationService,
  worker: NotificationWorker;
const settings = notificationSettings({
  YAMA_DEMO_ONLY: "true",
  YAMA_MAIL_PROVIDER: "resend",
  YAMA_MAIL_LIVE_ENABLED: "true",
  YAMA_MAIL_DATA_POLICY_ACKNOWLEDGED: "true",
  YAMA_MAIL_RESEND_DOMAIN_VERIFIED: "true",
  RESEND_API_KEY: "fake-resend-key",
  YAMA_MAIL_FROM: "notifications@example.com",
  YAMA_MAIL_FALLBACK_ENABLED: "true",
  YAMA_MAIL_GMAIL_AUTH: "app_password",
  GMAIL_USER: "yama.fixture@gmail.com",
  GMAIL_APP_PASSWORD: "fakeapppassword1",
});
const runner: NotificationRunner = vi.fn(async () => ({
  outcome: "accepted",
  providerRef: randomUUID(),
}));
const approve = (
  preview: { revision: number; receipt: string },
  allowFallback = false,
  key = randomUUID(),
) => ({
  expectedRevision: preview.revision,
  receipt: preview.receipt,
  key,
  acknowledged: true,
  allowFallback,
});
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
});
beforeEach(async () => {
  for (const name of [
    "reports",
    "report_revisions",
    "notification_jobs",
    "notification_recipients",
    "notification_budgets",
  ])
    await db.collection(name).deleteMany({});
  vi.mocked(runner)
    .mockReset()
    .mockResolvedValue({ outcome: "accepted", providerRef: randomUUID() });
  service = new NotificationService(
    db,
    client,
    () => settings,
    "http://127.0.0.1:3000",
  );
  worker = new NotificationWorker(service, runner);
  report = await new ReportRepository(db, client).create(
    "owner-a",
    {
      synthetic: true,
      language: "hi",
      narrative:
        "Private account secret@example.invalid; synthetic loss ₹7000.",
    },
    randomUUID(),
  );
  await service.registerRecipient("owner-a", "operator@example.com", true);
});
afterAll(async () => {
  if (client) {
    await client.db(namespace).dropDatabase();
    await client.close();
  }
});
describe("approved durable notifications", () => {
  it("returns one canonical preview for concurrent preparation requests", async () => {
    const previews = await Promise.all([
      service.preview("owner-a", report._id),
      service.preview("owner-a", report._id),
    ]);
    expect(previews[0].id).toBe(previews[1].id);
    expect(await service.jobs.countDocuments()).toBe(1);
  });
  it("does not dispatch previews and excludes private narration from provider payloads", async () => {
    const preview = await service.preview("owner-a", report._id);
    expect(preview.status).toBe("draft");
    expect(await worker.runOnce()).toBe(false);
    expect(JSON.stringify(preview.content)).not.toMatch(
      /secret@example|7000|owner-a|Private account/,
    );
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "accepted",
    );
    expect(JSON.stringify(vi.mocked(runner).mock.calls[0][1])).not.toMatch(
      /secret@example|7000|owner-a|Private account/,
    );
    expect(
      (await new ReportRepository(db, client).get("owner-a", report._id))
        .confirmation,
    ).toBeNull();
  });
  it("requires current explicit approval, exact content and owned references", async () => {
    const preview = await service.preview("owner-a", report._id);
    await expect(service.preview("owner-b", report._id)).rejects.toThrow(
      "report_not_found",
    );
    for (const change of [
      { acknowledged: false },
      { receipt: "a".repeat(64) },
      { expectedRevision: 2 },
      { to: "evil@example.com" },
    ])
      await expect(
        service.approve("owner-a", report._id, preview.id, {
          ...approve(preview),
          ...change,
        }),
      ).rejects.toThrow();
    expect(runner).not.toHaveBeenCalled();
  });
  it("replays approved requests without sending again, including alternate keys", async () => {
    const preview = await service.preview("owner-a", report._id),
      command = approve(preview);
    const first = await service.approve(
      "owner-a",
      report._id,
      preview.id,
      command,
    );
    expect(
      (await service.approve("owner-a", report._id, preview.id, command)).id,
    ).toBe(first.id);
    await worker.runOnce();
    await expect(
      service.approve("owner-a", report._id, preview.id, {
        ...command,
        key: randomUUID(),
      }),
    ).rejects.toThrow("mail_already_approved");
    expect(await worker.runOnce()).toBe(false);
    expect(runner).toHaveBeenCalledOnce();
  });
  it("cancels queued mail before any provider call", async () => {
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    expect(
      (await service.cancel("owner-a", report._id, preview.id)).status,
    ).toBe("canceled");
    expect(await worker.runOnce()).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });
  it("does not retry or fail over after ambiguous delivery", async () => {
    vi.mocked(runner).mockResolvedValue({
      outcome: "delivery_unknown",
      code: "transport_uncertain",
    });
    const preview = await service.preview("owner-a", report._id);
    await service.approve(
      "owner-a",
      report._id,
      preview.id,
      approve(preview, true),
    );
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "delivery_unknown",
    );
    expect(await worker.runOnce()).toBe(false);
    expect(runner).toHaveBeenCalledOnce();
  });
  it("never bypasses a recipient or provider policy rejection through Gmail", async () => {
    vi.mocked(runner).mockResolvedValue({
      outcome: "rejected",
      code: "provider_rejected",
    });
    const preview = await service.preview("owner-a", report._id);
    await service.approve(
      "owner-a",
      report._id,
      preview.id,
      approve(preview, true),
    );
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "failed",
    );
    expect(await worker.runOnce()).toBe(false);
    expect(runner).toHaveBeenCalledOnce();
  });
  it("uses fallback only after proven connection non-acceptance and approved fallback", async () => {
    vi.mocked(runner)
      .mockResolvedValueOnce({
        outcome: "not_accepted",
        code: "connection_unavailable",
      })
      .mockResolvedValueOnce({
        outcome: "accepted",
        providerRef: randomUUID(),
      });
    const preview = await service.preview("owner-a", report._id);
    await service.approve(
      "owner-a",
      report._id,
      preview.id,
      approve(preview, true),
    );
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "queued",
    );
    await worker.runOnce();
    const accepted = await service.get("owner-a", report._id, preview.id);
    expect(accepted).toMatchObject({
      status: "accepted",
      provider: "gmail",
      attempts: 2,
      deliveryConfirmed: false,
    });
    expect(vi.mocked(runner).mock.calls.map((call) => call[0])).toEqual([
      "resend",
      "gmail",
    ]);
  });
  it("does not use fallback when the user declined it", async () => {
    vi.mocked(runner).mockResolvedValue({
      outcome: "not_accepted",
      code: "connection_unavailable",
    });
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "failed",
    );
    expect(runner).toHaveBeenCalledOnce();
  });
  it("rejects expired approval and revoked recipients before sending", async () => {
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    await service.jobs.updateOne(
      { _id: preview.id },
      { $set: { expiresAt: new Date(0) } },
    );
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "expired",
    );
    expect(runner).not.toHaveBeenCalled();
  });
  it("preserves accepted delivery truth when cancellation arrives after dispatch starts", async () => {
    let finish!: (outcome: unknown) => void, entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const slow: NotificationRunner = async () => {
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    const running = new NotificationWorker(service, slow).runOnce();
    await started;
    expect(
      (await service.cancel("owner-a", report._id, preview.id)).status,
    ).toBe("dispatching");
    finish({ outcome: "accepted", providerRef: randomUUID() });
    await running;
    expect(await service.get("owner-a", report._id, preview.id)).toMatchObject({
      status: "accepted",
      cancellationRequested: true,
      deliveryConfirmed: false,
    });
  });
  it("never replays an expired dispatch claim", async () => {
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    await db.collection<NotificationRecord>("notification_jobs").updateOne(
      { _id: preview.id },
      {
        $set: {
          status: "dispatching",
          attempts: 1,
          claimToken: randomUUID(),
          leaseUntil: new Date(0),
        },
      },
    );
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "delivery_unknown",
    );
    expect(runner).not.toHaveBeenCalled();
  });
  it("captures fixture notifications without network access or live budget usage", async () => {
    service = new NotificationService(
      db,
      client,
      () => notificationSettings({ YAMA_DEMO_ONLY: "true" }),
      "http://127.0.0.1:3000",
    );
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    await new NotificationWorker(service, runner).runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "captured",
    );
    expect(runner).not.toHaveBeenCalled();
    expect(await db.collection("notification_budgets").countDocuments()).toBe(
      0,
    );
  });
  it("revokes a queued approval after its recipient or report changes", async () => {
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    await service.recipients.updateOne(
      { _id: preview.recipient.id },
      { $set: { active: false } },
    );
    await worker.runOnce();
    expect((await service.get("owner-a", report._id, preview.id)).status).toBe(
      "stale",
    );
    expect(runner).not.toHaveBeenCalled();
  });
  it("rejects a changed configuration before dispatch", async () => {
    let current = settings;
    service = new NotificationService(
      db,
      client,
      () => current,
      "http://127.0.0.1:3000",
    );
    worker = new NotificationWorker(service, runner);
    const preview = await service.preview("owner-a", report._id);
    await service.approve("owner-a", report._id, preview.id, approve(preview));
    current = { ...settings, from: "changed@example.com" };
    await worker.runOnce();
    expect(
      (await service.get("owner-a", report._id, preview.id)).errorCode,
    ).toBe("mail_config_changed");
    expect(runner).not.toHaveBeenCalled();
  });
  it("reserves fallback attempts separately and never exceeds the lifetime cap", async () => {
    service = new NotificationService(
      db,
      client,
      () => ({ ...settings, maxAttempts: 1 }),
      "http://127.0.0.1:3000",
    );
    worker = new NotificationWorker(service, runner);
    vi.mocked(runner).mockResolvedValue({
      outcome: "not_accepted",
      code: "connection_unavailable",
    });
    const preview = await service.preview("owner-a", report._id);
    await service.approve(
      "owner-a",
      report._id,
      preview.id,
      approve(preview, true),
    );
    await worker.runOnce();
    await worker.runOnce();
    expect(
      (await service.get("owner-a", report._id, preview.id)).errorCode,
    ).toBe("mail_budget_exhausted");
    expect(runner).toHaveBeenCalledOnce();
    expect(
      (
        await db
          .collection("notification_budgets")
          .findOne({ _id: "mail-synthetic-demo" } as never)
      )?.reservedAttempts,
    ).toBe(1);
  });
  it("holds one dispatch lease across concurrent workers", async () => {
    const second = await new ReportRepository(db, client).create(
      "owner-a",
      {
        synthetic: true,
        language: "en",
        narrative: "Another synthetic report.",
      },
      randomUUID(),
    );
    for (const current of [report, second]) {
      const preview = await service.preview("owner-a", current._id);
      await service.approve(
        "owner-a",
        current._id,
        preview.id,
        approve(preview),
      );
    }
    let finish!: (value: unknown) => void, entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const slow: NotificationRunner = async () => {
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const first = new NotificationWorker(service, slow).runOnce();
    await started;
    expect(await worker.runOnce()).toBe(false);
    finish({ outcome: "accepted", providerRef: randomUUID() });
    await first;
    expect(await worker.runOnce()).toBe(true);
    expect(runner).toHaveBeenCalledOnce();
  });
  it("requires a fresh receipt after an unapproved preview expires", async () => {
    const previous = await service.preview("owner-a", report._id);
    await service.jobs.updateOne(
      { _id: previous.id },
      { $set: { expiresAt: new Date(0) } },
    );
    const fresh = await service.preview("owner-a", report._id);
    expect(fresh.id).toBe(previous.id);
    expect(fresh.receipt).not.toBe(previous.receipt);
    await expect(
      service.approve("owner-a", report._id, previous.id, approve(previous)),
    ).rejects.toThrow("mail_preview_changed");
    expect(runner).not.toHaveBeenCalled();
  });
});
