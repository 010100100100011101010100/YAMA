import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { ClientSession, Db, MongoClient } from "mongodb";
import {
  publicWebCommand,
  publicWebView,
  type PublicWebResult,
} from "@/lib/public-web";
import { parse, type Report } from "@/server/reports/domain";
import { assistanceCatalogue } from "@/server/assistance/catalogue";
import { ServiceError } from "@/server/errors";
import { transactionOptions } from "@/server/dialogue/service";
import { PUBLIC_WEB_POLICY } from "./policy";
import {
  PAGE_RESERVATION_CREDITS,
  SEARCH_RESERVATION_MICRO_USD,
  publicWebAdapter,
  publicWebConfigHash,
  publicWebSettings,
  type PublicWebSettings,
} from "./config";
import type { PublicWebBudget, PublicWebRecord } from "./records";

type WorkerLock = { _id: string; claimToken: string | null; leaseUntil: Date };
export class PublicWebService {
  constructor(
    readonly database: Db,
    readonly client: MongoClient,
    readonly settings: () => PublicWebSettings = publicWebSettings,
  ) {}
  get jobs() {
    return this.database.collection<PublicWebRecord>("public_web_jobs");
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
  view(record: PublicWebRecord) {
    const localGuidance = assistanceCatalogue(record.language);
    return publicWebView.parse({
      id: record._id,
      reportId: record.reportId,
      revision: record.revision,
      agent: record.agent,
      topic: record.topic,
      operation: record.operation,
      status: record.status,
      expiresAt: record.expiresAt.toISOString(),
      errorCode: record.errorCode,
      result:
        record.result?.kind === "search"
          ? { ...record.result, localGuidance }
          : record.result,
      adapter: record.adapter,
      reused: record.reused,
      localGuidance,
    });
  }
  async start(ownerId: string, reportId: string, input: unknown) {
    const command = parse(publicWebCommand, input),
      settings = this.settings(),
      configHash = publicWebConfigHash(settings);
    const { key, ...semantic } = command;
    const requestHash = createHash("sha256")
      .update(JSON.stringify(semantic))
      .digest("hex");
    const record = await this.client.withSession((session) =>
      session.withTransaction(async () => {
        const report = await this.report(ownerId, reportId, session);
        if (report.revision !== command.expectedRevision)
          throw new ServiceError(409, "revision_conflict");
        const repeated = await this.jobs.findOne(
          { ownerId, reportId, requestKey: key },
          { session },
        );
        if (repeated) {
          if (repeated.requestHash !== requestHash)
            throw new ServiceError(409, "idempotency_conflict");
          return repeated;
        }
        if (
          (await this.jobs.countDocuments(
            { ownerId, reportId },
            { session },
          )) >= 20
        )
          throw new ServiceError(422, "public_web_goal_limit");
        let topic: PublicWebRecord["topic"],
          parent: PublicWebRecord | null = null;
        if (command.operation === "search_public_web") topic = command.topic;
        else {
          parent = await this.jobs.findOne(
            {
              _id: command.searchId,
              ownerId,
              reportId,
              revision: report.revision,
              status: "ready",
              operation: "search_public_web",
              expiresAt: { $gt: new Date() },
              configHash,
            },
            { session },
          );
          if (
            !parent ||
            parent.result?.kind !== "search" ||
            !parent.result.sources.some(
              (source) => source.id === command.sourceId,
            )
          )
            throw new ServiceError(404, "public_source_not_found");
          topic = parent.topic;
          const previous = await this.jobs.findOne(
            {
              ownerId,
              reportId,
              "command.searchId": command.searchId,
              "command.sourceId": command.sourceId,
            },
            { session },
          );
          if (previous)
            throw new ServiceError(409, "public_page_already_requested"); // Replay the original key or read its receipt; no new attempt for this selection.
          if (
            (await this.jobs.countDocuments(
              { ownerId, reportId, "command.searchId": command.searchId },
              { session },
            )) >= 3
          )
            throw new ServiceError(422, "public_page_goal_limit");
        }
        const now = new Date(),
          adapter = publicWebAdapter(settings.live, command.operation);
        let cached: PublicWebRecord | null = null;
        if (
          command.operation === "search_public_web" &&
          command.reason !== "freshness_requested"
        )
          cached = await this.jobs.findOne(
            {
              ownerId,
              reportId,
              revision: report.revision,
              operation: command.operation,
              topic,
              language: report.language,
              configHash,
              status: "ready",
              expiresAt: { $gt: now },
              cacheCreatedAt: { $gte: new Date(now.getTime() - 300000) },
            },
            { session, sort: { createdAt: -1 } },
          );
        const job: PublicWebRecord = {
          _id: randomUUID(),
          ownerId,
          reportId,
          revision: report.revision,
          language: report.language,
          agent: command.agent,
          operation: command.operation,
          topic,
          requestKey: key,
          requestHash,
          configHash,
          policy: PUBLIC_WEB_POLICY,
          command,
          createdAt: now,
          cacheCreatedAt: cached?.cacheCreatedAt ?? now,
          expiresAt:
            parent?.expiresAt ??
            cached?.expiresAt ??
            new Date(now.getTime() + 3600000),
          status: cached ? "ready" : "queued",
          result: cached?.result ?? null,
          reused: !!cached,
          errorCode: null,
          adapter,
          attempts: 0,
          claimToken: null,
          leaseUntil: null,
        };
        await this.jobs.insertOne(job, { session });
        await this.reports.updateOne(
          { _id: reportId, ownerId, revision: report.revision },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
        return job;
      }, transactionOptions),
    );
    return this.view(record);
  }
  async get(ownerId: string, reportId: string, id: string) {
    const report = await this.report(ownerId, reportId),
      record = await this.jobs.findOne({ _id: id, ownerId, reportId });
    if (!record) throw new ServiceError(404, "public_web_job_not_found");
    if (
      record.revision !== report.revision ||
      record.policy !== PUBLIC_WEB_POLICY ||
      record.expiresAt <= new Date()
    ) {
      await this.jobs.updateOne(
        { _id: id, ownerId, reportId },
        {
          $set: {
            status: "stale",
            result: null,
            claimToken: null,
            leaseUntil: null,
            errorCode: "public_web_stale",
          },
        },
      );
      return this.view({
        ...record,
        status: "stale",
        result: null,
        errorCode: "public_web_stale",
      });
    }
    return this.view(record);
  }
  async cancel(ownerId: string, reportId: string, id: string) {
    await this.client.withSession((session) =>
      session.withTransaction(async () => {
        await this.report(ownerId, reportId, session);
        await this.jobs.updateOne(
          {
            _id: id,
            ownerId,
            reportId,
            status: { $in: ["queued", "running", "ready"] },
          },
          {
            $set: {
              status: "canceled",
              result: null,
              claimToken: null,
              leaseUntil: null,
            },
          },
          { session },
        );
        await this.jobs.updateMany(
          {
            ownerId,
            reportId,
            "command.searchId": id,
            status: { $in: ["queued", "running", "ready"] },
          },
          {
            $set: {
              status: "canceled",
              result: null,
              claimToken: null,
              leaseUntil: null,
            },
          },
          { session },
        );
      }, transactionOptions),
    );
    return this.get(ownerId, reportId, id);
  }
  async claim(token: string) {
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const now = new Date(),
          locks = this.database.collection<WorkerLock>(
            "public_web_worker_lock",
          );
        const lock = await locks.findOneAndUpdate(
          { _id: "web", leaseUntil: { $lte: now } },
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
          { status: "running", leaseUntil: { $lte: now } },
          { session },
        );
        if (orphan) {
          await this.jobs.updateOne(
            { _id: orphan._id, status: "running" },
            {
              $set: {
                status: "failed",
                result: null,
                claimToken: null,
                leaseUntil: null,
                errorCode: "public_provider_outcome_unknown",
              },
            },
            { session },
          );
          return { record: orphan, orphan: true };
        }
        const record = await this.jobs.findOneAndUpdate(
          { status: "queued", attempts: 0 },
          {
            $set: {
              status: "running",
              claimToken: token,
              leaseUntil: new Date(now.getTime() + 35000),
            },
            $inc: { attempts: 1 },
          },
          { session, returnDocument: "after", sort: { createdAt: 1 } },
        );
        if (!record) {
          await locks.updateOne(
            { _id: "web", claimToken: token },
            { $set: { claimToken: null, leaseUntil: new Date(0) } },
            { session },
          );
          return null;
        }
        return { record, orphan: false };
      }, transactionOptions),
    );
  }
  async current(
    record: PublicWebRecord,
    token: string,
    session?: ClientSession,
  ) {
    const report = await this.report(record.ownerId, record.reportId, session);
    const job = await this.jobs.findOne(
      {
        _id: record._id,
        ownerId: record.ownerId,
        status: "running",
        claimToken: token,
        leaseUntil: { $gt: new Date() },
      },
      { session },
    );
    if (
      !job ||
      report.revision !== record.revision ||
      record.expiresAt <= new Date()
    )
      throw new ServiceError(409, "public_web_stale");
    return job;
  }
  async reserve(
    record: PublicWebRecord,
    token: string,
    settings: PublicWebSettings,
  ) {
    if (!settings.live) return;
    await this.client.withSession((session) =>
      session.withTransaction(async () => {
        await this.current(record, token, session);
        const budgets =
          this.database.collection<PublicWebBudget>("public_web_budgets");
        await budgets.updateOne(
          { _id: "public-web-demo" },
          {
            $setOnInsert: {
              reservedSearches: 0,
              reservedPages: 0,
              reservedExaMicroUsd: 0,
              reservedFirecrawlCredits: 0,
              blocked: false,
            },
          },
          { upsert: true, session },
        );
        const search = record.operation === "search_public_web";
        const reserved = await budgets.updateOne(
          {
            _id: "public-web-demo",
            blocked: false,
            ...(search
              ? {
                  reservedSearches: { $lt: settings.maxSearches },
                  reservedExaMicroUsd: {
                    $lte:
                      settings.maxExaMicroUsd - SEARCH_RESERVATION_MICRO_USD,
                  },
                }
              : {
                  reservedPages: { $lt: settings.maxPages },
                  reservedFirecrawlCredits: {
                    $lte:
                      settings.maxFirecrawlCredits - PAGE_RESERVATION_CREDITS,
                  },
                }),
          },
          {
            $inc: search
              ? {
                  reservedSearches: 1,
                  reservedExaMicroUsd: SEARCH_RESERVATION_MICRO_USD,
                }
              : {
                  reservedPages: 1,
                  reservedFirecrawlCredits: PAGE_RESERVATION_CREDITS,
                },
          },
          { session },
        );
        if (!reserved.matchedCount)
          throw new ServiceError(422, "public_web_budget_exhausted");
        await this.reports.updateOne(
          {
            _id: record.reportId,
            ownerId: record.ownerId,
            revision: record.revision,
          },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
      }, transactionOptions),
    );
  }
  async publish(
    record: PublicWebRecord,
    token: string,
    result: PublicWebResult,
  ) {
    await this.client.withSession((session) =>
      session.withTransaction(async () => {
        await this.current(record, token, session);
        if (publicWebConfigHash(this.settings()) !== record.configHash)
          throw new ServiceError(409, "public_web_config_changed");
        if (record.command.operation === "fetch_public_page") {
          const parent = await this.jobs.updateOne(
            {
              _id: record.command.searchId,
              ownerId: record.ownerId,
              reportId: record.reportId,
              revision: record.revision,
              status: "ready",
              expiresAt: { $gt: new Date() },
            },
            { $inc: { pageFence: 1 } },
            { session },
          );
          if (!parent.matchedCount)
            throw new ServiceError(409, "public_source_not_found");
        }
        await this.reports.updateOne(
          {
            _id: record.reportId,
            ownerId: record.ownerId,
            revision: record.revision,
          },
          { $inc: { agentTaskFence: 1 } },
          { session },
        );
        await this.jobs.updateOne(
          { _id: record._id, status: "running", claimToken: token },
          {
            $set: {
              status: "ready",
              result,
              errorCode: null,
              claimToken: null,
              leaseUntil: null,
            },
          },
          { session },
        );
      }, transactionOptions),
    );
  }
  async fail(record: PublicWebRecord, token: string, code: string) {
    const report = await this.reports.findOne(
      {
        _id: record.reportId,
        ownerId: record.ownerId,
        revision: record.revision,
      },
      { projection: { _id: 1 } },
    );
    await this.jobs.updateOne(
      { _id: record._id, status: "running", claimToken: token },
      {
        $set: {
          status: report && record.expiresAt > new Date() ? "failed" : "stale",
          result: null,
          errorCode: code,
          claimToken: null,
          leaseUntil: null,
        },
      },
    );
  }
  async release(token: string) {
    await this.database
      .collection<WorkerLock>("public_web_worker_lock")
      .updateOne(
        { _id: "web", claimToken: token },
        { $set: { claimToken: null, leaseUntil: new Date(0) } },
      );
  }
}
