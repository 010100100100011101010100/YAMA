import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db, MongoClient, ClientSession } from "mongodb";
import {
  notificationApprovalSchema,
  notificationViewSchema,
  type NotificationView,
} from "@/lib/notification";
import { parse, type Report } from "@/server/reports/domain";
import { ServiceError } from "@/server/errors";
import { getServerConfig } from "@/server/config";
import { transactionOptions } from "@/server/dialogue/service";
import { buildNotificationContent } from "./domain";
import {
  notificationSettings,
  notificationConfigHash,
  type NotificationSettings,
} from "./config";
import type {
  NotificationRecord,
  RecipientRecord,
  NotificationBudget,
} from "./records";
import type { NotificationOutcome } from "./runtime";
type Lock = { _id: string; claimToken: string | null; leaseUntil: Date };
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class NotificationService {
  constructor(
    readonly database: Db,
    readonly client: MongoClient,
    readonly settings: () => NotificationSettings = notificationSettings,
    readonly origin = getServerConfig().origin,
  ) {}
  get jobs() {
    return this.database.collection<NotificationRecord>("notification_jobs");
  }
  get recipients() {
    return this.database.collection<RecipientRecord>("notification_recipients");
  }
  private get reports() {
    return this.database.collection<Report>("reports");
  }
  async report(ownerId: string, reportId: string, session?: ClientSession) {
    const report = await this.reports.findOne(
      { _id: reportId, ownerId },
      { session },
    );
    if (!report) throw new ServiceError(404, "report_not_found");
    return report;
  }
  view(record: NotificationRecord): NotificationView {
    return notificationViewSchema.parse({
      id: record._id,
      reportId: record.reportId,
      revision: record.revision,
      template: record.template,
      language: record.language,
      recipient: record.recipient,
      from: record.from,
      replyTo: record.replyTo,
      fallbackFrom: record.fallbackFrom,
      content: record.content,
      receipt: record.receipt,
      expiresAt: record.expiresAt.toISOString(),
      approvedAt: record.approvedAt?.toISOString() ?? null,
      status: record.status,
      provider: record.provider,
      attempts: record.attempts,
      cancellationRequested: !!record.cancelRequestedAt,
      deliveryConfirmed: false,
      errorCode: record.errorCode,
      providerRef: record.providerRef,
    });
  }
  // Trusted local operator provisioning only; no HTTP or agent capability exposes it.
  async registerRecipient(
    ownerId: string,
    address: string,
    acknowledged: boolean,
  ) {
    if (
      !acknowledged ||
      !z.email().max(254).safeParse(address).success ||
      /[\r\n<>\s]/.test(address) ||
      address.toLowerCase().endsWith(".invalid")
    )
      throw new ServiceError(400, "mail_recipient_invalid");
    await this.recipients.updateOne(
      { ownerId, mode: "live" },
      {
        $set: {
          address,
          verification: "operator_confirmed_synthetic",
          active: true,
          verifiedAt: new Date(),
        },
        $setOnInsert: { _id: randomUUID(), approvalFence: 0 },
      },
      { upsert: true },
    );
  }
  async preview(ownerId: string, reportId: string) {
    const settings = this.settings(),
      configHash = notificationConfigHash(settings, this.origin);
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const report = await this.report(ownerId, reportId, session),
          mode = settings.live ? "live" : "fixture";
        if (!settings.live)
          await this.recipients.updateOne(
            { ownerId, mode },
            {
              $setOnInsert: {
                _id: randomUUID(),
                address: "preview@example.invalid",
                verification: "fixture",
                active: true,
                verifiedAt: new Date(),
                approvalFence: 0,
              },
            },
            { upsert: true, session },
          );
        const recipient = await this.recipients.findOne(
          {
            ownerId,
            mode,
            active: true,
            verification: settings.live
              ? "operator_confirmed_synthetic"
              : "fixture",
          },
          { session },
        );
        if (!recipient) throw new ServiceError(422, "mail_recipient_required");
        const content = buildNotificationContent(report.language, this.origin),
          logicalHash = hash({
            reportId,
            revision: report.revision,
            recipientId: recipient._id,
            address: recipient.address,
            configHash,
            content,
          });
        const existing = await this.jobs.findOne(
            { ownerId, reportId, logicalHash },
            { session },
          ),
          now = new Date();
        if (
          existing &&
          !(existing.status === "draft" && existing.expiresAt <= now)
        )
          return this.view(existing);
        if (
          !existing &&
          (await this.jobs.countDocuments(
            { ownerId, reportId },
            { session },
          )) >= 20
        )
          throw new ServiceError(422, "mail_goal_limit");
        const id = existing?._id ?? randomUUID(),
          expiresAt = new Date(now.getTime() + 600000),
          receipt = hash({ id, logicalHash, expiresAt });
        const record: NotificationRecord = {
          _id: id,
          ownerId,
          reportId,
          revision: report.revision,
          template: "workspace-link-v1",
          language: report.language,
          recipient: {
            id: recipient._id,
            address: recipient.address,
            verification: recipient.verification,
          },
          from: settings.from,
          replyTo: settings.replyTo,
          fallbackFrom: settings.fallbackEnabled ? settings.gmailUser : null,
          content,
          receipt,
          logicalHash,
          configHash,
          requestKey: null,
          requestHash: null,
          createdAt: existing?.createdAt ?? now,
          expiresAt,
          approvedAt: null,
          allowFallback: false,
          cancelRequestedAt: null,
          status: "draft",
          provider: settings.live ? "resend" : "fixture",
          attempts: 0,
          errorCode: null,
          providerRef: null,
          claimToken: null,
          leaseUntil: null,
          outcomes: [],
        };
        if (existing)
          await this.jobs.replaceOne({ _id: id, status: "draft" }, record, {
            session,
          });
        else await this.jobs.insertOne(record, { session });
        await this.reports.updateOne(
          { _id: reportId, ownerId, revision: report.revision },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
        return this.view(record);
      }, transactionOptions),
    );
  }
  async get(ownerId: string, reportId: string, id: string) {
    await this.report(ownerId, reportId);
    const record = await this.jobs.findOne({ _id: id, ownerId, reportId });
    if (!record) throw new ServiceError(404, "mail_job_not_found");
    return this.view(record);
  }
  private async invalid(
    record: NotificationRecord,
    settings: NotificationSettings,
    session: ClientSession,
  ) {
    if (record.expiresAt <= new Date())
      return { status: "expired" as const, code: "mail_expired" };
    if (notificationConfigHash(settings, this.origin) !== record.configHash)
      return { status: "stale" as const, code: "mail_config_changed" };
    const report = await this.reports.findOne(
      {
        _id: record.reportId,
        ownerId: record.ownerId,
        revision: record.revision,
      },
      { session },
    );
    const recipient = await this.recipients.findOne(
      {
        _id: record.recipient.id,
        ownerId: record.ownerId,
        active: true,
        address: record.recipient.address,
        mode: settings.live ? "live" : "fixture",
        verification: settings.live
          ? "operator_confirmed_synthetic"
          : "fixture",
      },
      { session },
    );
    if (!report || !recipient)
      return { status: "stale" as const, code: "mail_preview_changed" };
    return null;
  }
  async approve(ownerId: string, reportId: string, id: string, input: unknown) {
    const command = parse(notificationApprovalSchema, input),
      requestHash = hash(command),
      settings = this.settings();
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const report = await this.report(ownerId, reportId, session),
          record = await this.jobs.findOne(
            { _id: id, ownerId, reportId },
            { session },
          );
        if (!record) throw new ServiceError(404, "mail_job_not_found");
        const repeated = await this.jobs.findOne(
          { ownerId, reportId, requestKey: command.key },
          { session },
        );
        if (repeated) {
          if (repeated._id !== id || repeated.requestHash !== requestHash)
            throw new ServiceError(409, "idempotency_conflict");
          return this.view(repeated);
        }
        if (record.requestKey)
          throw new ServiceError(409, "mail_already_approved");
        if (record.status !== "draft")
          throw new ServiceError(409, "mail_not_approvable");
        if (
          report.revision !== command.expectedRevision ||
          record.revision !== command.expectedRevision
        )
          throw new ServiceError(409, "revision_conflict");
        if (record.receipt !== command.receipt)
          throw new ServiceError(409, "mail_preview_changed");
        const invalid = await this.invalid(record, settings, session);
        if (invalid) throw new ServiceError(409, invalid.code);
        if (command.allowFallback && !settings.fallbackEnabled)
          throw new ServiceError(400, "mail_fallback_unavailable");
        const update = {
          status: "queued" as const,
          requestKey: command.key,
          requestHash,
          approvedAt: new Date(),
          allowFallback: command.allowFallback,
        };
        await this.jobs.updateOne(
          { _id: id, status: "draft" },
          { $set: update },
          { session },
        );
        await this.fence(record, session);
        return this.view({ ...record, ...update });
      }, transactionOptions),
    );
  }
  private async fence(record: NotificationRecord, session: ClientSession) {
    await this.reports.updateOne(
      {
        _id: record.reportId,
        ownerId: record.ownerId,
        revision: record.revision,
      },
      { $inc: { agentTaskFence: 1 } },
      { session },
    );
    await this.recipients.updateOne(
      { _id: record.recipient.id, ownerId: record.ownerId },
      { $inc: { approvalFence: 1 } },
      { session },
    );
  }
  async cancel(ownerId: string, reportId: string, id: string) {
    await this.client.withSession((session) =>
      session.withTransaction(async () => {
        await this.report(ownerId, reportId, session);
        const record = await this.jobs.findOne(
          { _id: id, ownerId, reportId },
          { session },
        );
        if (!record) throw new ServiceError(404, "mail_job_not_found");
        if (["draft", "queued"].includes(record.status))
          await this.jobs.updateOne(
            { _id: id },
            { $set: { status: "canceled", cancelRequestedAt: new Date() } },
            { session },
          );
        else if (record.status === "dispatching")
          await this.jobs.updateOne(
            { _id: id },
            { $set: { cancelRequestedAt: new Date() } },
            { session },
          );
        else if (
          ["accepted", "captured", "delivery_unknown"].includes(record.status)
        )
          throw new ServiceError(409, "mail_cannot_recall");
      }, transactionOptions),
    );
    return this.get(ownerId, reportId, id);
  }
  async claim(token: string) {
    const settings = this.settings();
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const now = new Date(),
          locks = this.database.collection<Lock>("notification_worker_lock"),
          lock = await locks.findOneAndUpdate(
            { _id: "mail", leaseUntil: { $lte: now } },
            {
              $set: {
                claimToken: token,
                leaseUntil: new Date(now.getTime() + 40000),
              },
            },
            { returnDocument: "after", session },
          );
        if (!lock) return null;
        const orphan = await this.jobs.findOne(
          { status: "dispatching", leaseUntil: { $lte: now } },
          { session },
        );
        if (orphan) {
          await this.jobs.updateOne(
            { _id: orphan._id, status: "dispatching" },
            {
              $set: {
                status: "delivery_unknown",
                errorCode: "mail_outcome_unknown",
                claimToken: null,
                leaseUntil: null,
              },
            },
            { session },
          );
          return { record: null, settings };
        }
        const record = await this.jobs.findOne(
          { status: "queued", attempts: { $lt: 2 } },
          { session, sort: { createdAt: 1 } },
        );
        if (!record) {
          await locks.updateOne(
            { _id: "mail", claimToken: token },
            { $set: { claimToken: null, leaseUntil: new Date(0) } },
            { session },
          );
          return null;
        }
        const invalid = await this.invalid(record, settings, session);
        if (invalid) {
          await this.jobs.updateOne(
            { _id: record._id, status: "queued" },
            { $set: { status: invalid.status, errorCode: invalid.code } },
            { session },
          );
          return { record: null, settings };
        }
        if (settings.live) {
          const budgets = this.database.collection<NotificationBudget>(
            "notification_budgets",
          );
          await budgets.updateOne(
            { _id: "mail-synthetic-demo" },
            { $setOnInsert: { reservedAttempts: 0 } },
            { upsert: true, session },
          );
          const reserved = await budgets.updateOne(
            {
              _id: "mail-synthetic-demo",
              reservedAttempts: { $lt: settings.maxAttempts },
            },
            { $inc: { reservedAttempts: 1 } },
            { session },
          );
          if (!reserved.matchedCount) {
            await this.jobs.updateOne(
              { _id: record._id, status: "queued" },
              {
                $set: { status: "failed", errorCode: "mail_budget_exhausted" },
              },
              { session },
            );
            return { record: null, settings };
          }
        }
        const updated = await this.jobs.findOneAndUpdate(
          { _id: record._id, status: "queued" },
          {
            $set: {
              status: "dispatching",
              claimToken: token,
              leaseUntil: new Date(now.getTime() + 30000),
            },
            $inc: { attempts: 1 },
          },
          { session, returnDocument: "after" },
        );
        await this.fence(record, session);
        return { record: updated, settings };
      }, transactionOptions),
    );
  }
  async finish(
    record: NotificationRecord,
    token: string,
    outcome: NotificationOutcome,
  ) {
    await this.client.withSession((session) =>
      session.withTransaction(async () => {
        const current = await this.jobs.findOne(
          { _id: record._id, status: "dispatching", claimToken: token },
          { session },
        );
        if (!current) return;
        let status: NotificationRecord["status"],
          provider = current.provider,
          errorCode: string | null = null,
          providerRef: string | null = null;
        if (outcome.outcome === "accepted" || outcome.outcome === "captured") {
          status = outcome.outcome;
          providerRef = outcome.providerRef;
        } else if (outcome.outcome === "delivery_unknown") {
          status = "delivery_unknown";
          errorCode = outcome.code;
        } else {
          status = "failed";
          errorCode = outcome.code;
          if (
            outcome.outcome === "not_accepted" &&
            outcome.code === "connection_unavailable" &&
            current.provider === "resend" &&
            current.allowFallback
          ) {
            const settings = this.settings(),
              invalid = await this.invalid(current, settings, session);
            if (current.cancelRequestedAt) {
              status = "canceled";
              errorCode = "mail_canceled";
            } else if (invalid) {
              status = invalid.status;
              errorCode = invalid.code;
            } else if (settings.fallbackEnabled) {
              status = "queued";
              provider = "gmail";
              await this.fence(current, session);
            }
          }
        }
        // An accepted send remains accepted even after cancellation/editing; mail cannot be recalled.
        await this.jobs.updateOne(
          { _id: record._id, status: "dispatching", claimToken: token },
          {
            $set: {
              status,
              provider,
              errorCode,
              providerRef,
              claimToken: null,
              leaseUntil: null,
            },
            $push: {
              outcomes: {
                provider: current.provider,
                outcome: outcome.outcome,
                at: new Date(),
                code: "code" in outcome ? outcome.code : null,
                providerRef:
                  "providerRef" in outcome ? outcome.providerRef : null,
              },
            },
          },
          { session },
        );
      }, transactionOptions),
    );
  }
  async unknown(record: NotificationRecord, token: string) {
    await this.jobs.updateOne(
      { _id: record._id, status: "dispatching", claimToken: token },
      {
        $set: {
          status: "delivery_unknown",
          errorCode: "mail_outcome_unknown",
          claimToken: null,
          leaseUntil: null,
        },
      },
    );
  }
  async release(token: string) {
    await this.database
      .collection<Lock>("notification_worker_lock")
      .updateOne(
        { _id: "mail", claimToken: token },
        { $set: { claimToken: null, leaseUntil: new Date(0) } },
      );
  }
}
