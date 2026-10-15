import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Db, MongoClient, ClientSession } from "mongodb";
import { detailCommand, detailSchema } from "@/lib/billing";
import {
  connectionsSchema,
  CONNECTION_RECIPE,
  type ConnectionsResult,
} from "@/lib/connections";
import { parse, type Report } from "@/server/reports/domain";
import { ReportRepository } from "@/server/reports/repository";
import { getConnections } from "@/server/reports/connections";
import {
  receiptIsCurrent,
  type CatalogueCase,
} from "@/server/reports/catalogue-policy";
import { GraphStore } from "@/server/database/graph";
import { connectGraph } from "@/server/database/graph-client";
import { getServerConfig } from "@/server/config";
import { ServiceError } from "@/server/errors";
import { transactionOptions } from "@/server/dialogue/service";
import { freeDetailCount } from "./domain";
import { BillingService } from "./service";
import type { DetailBatch, DetailAccess, CreditConsumption } from "./records";
export type ConnectionReader = (
  ownerId: string,
  reportId: string,
) => Promise<ConnectionsResult>;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class IntelligenceService {
  constructor(
    readonly database: Db,
    readonly client: MongoClient,
    readonly billing: BillingService,
    private readonly compare: ConnectionReader = async (ownerId, reportId) => {
      const config = getServerConfig(),
        graph = await connectGraph(
          config.graphHost,
          config.graphPort,
          config.graphPassword,
        );
      try {
        return await getConnections(
          new ReportRepository(database, client),
          new GraphStore(graph, config.mongoDatabase),
          ownerId,
          reportId,
        );
      } finally {
        await graph.close();
      }
    },
  ) {}
  private get batches() {
    return this.database.collection<DetailBatch>("intelligence_batches");
  }
  private get accesses() {
    return this.database.collection<DetailAccess>("intelligence_accesses");
  }
  private get consumptions() {
    return this.database.collection<CreditConsumption>("billing_consumptions");
  }
  private async report(ownerId: string, id: string, session?: ClientSession) {
    const report = await this.database
      .collection<Report>("reports")
      .findOne({ _id: id, ownerId }, { session });
    if (!report) throw new ServiceError(404, "report_not_found");
    return report;
  }
  private async current(
    ownerId: string,
    reportId: string,
    batchId: string,
    session: ClientSession,
  ) {
    const report = await this.report(ownerId, reportId, session),
      batch = await this.batches.findOne(
        { _id: batchId, ownerId, reportId },
        { session },
      );
    if (!batch) throw new ServiceError(404, "intelligence_not_found");
    if (
      report.revision !== batch.revision ||
      report.confirmation?.revision !== report.revision ||
      !(await receiptIsCurrent(this.database, batch.sourceReceipt, session))
    )
      throw new ServiceError(409, "intelligence_stale");
    return { report, batch };
  }
  private async fence(
    report: Report,
    batch: DetailBatch,
    session: ClientSession,
  ) {
    await this.database
      .collection<Report>("reports")
      .updateOne(
        { _id: report._id, ownerId: report.ownerId, revision: report.revision },
        { $inc: { agentTaskFence: 1 } },
        { session },
      );
    if (batch.sourceReceipt.cases.length)
      await this.database.collection<CatalogueCase>("catalogue").updateMany(
        {
          _id: { $in: batch.sourceReceipt.cases.map((source) => source.id) },
          synthetic: true,
          published: true,
        },
        { $inc: { entitlementFence: 1 } },
        { session },
      );
  }
  private async allowed(
    access: DetailAccess | null,
    ownerId: string,
    session: ClientSession,
  ) {
    return (
      (access && !access.grantId) ||
      !!(
        access &&
        (await this.billing.grants.findOne(
          {
            _id: access.grantId!,
            ownerId,
            scope: this.billing.settings().scope,
            active: true,
          },
          { session },
        ))
      )
    );
  }
  async preview(ownerId: string, reportId: string) {
    const comparison = connectionsSchema.parse(
      await this.compare(ownerId, reportId),
    );
    if (comparison.status !== "ready")
      throw new ServiceError(409, "projection_pending");
    const sourceReceipt = {
        recipe: CONNECTION_RECIPE,
        revision: comparison.revision,
        cases: comparison.candidates.map((candidate) => ({
          id: candidate.id,
          version: candidate.explanation.catalogueVersion,
        })),
      },
      fingerprint = hash(comparison);
    const batch = await this.client.withSession((session) =>
      session.withTransaction(async () => {
        const report = await this.report(ownerId, reportId, session);
        if (
          report.revision !== comparison.revision ||
          report.confirmation?.revision !== report.revision ||
          !(await receiptIsCurrent(this.database, sourceReceipt, session))
        )
          throw new ServiceError(409, "intelligence_stale");
        await this.database
          .collection<Report>("reports")
          .updateOne(
            { _id: reportId, ownerId, revision: report.revision },
            { $inc: { agentTaskFence: 1 } },
            { session },
          );
        const existing = await this.batches.findOne(
          { ownerId, reportId, revision: report.revision, fingerprint },
          { session },
        );
        if (existing) return existing;
        const id = randomUUID(),
          details = sourceReceipt.cases.length
            ? Array.from({ length: 20 }, (_, ordinal) =>
                detailSchema.parse({
                  id: randomUUID(),
                  ordinal,
                  title: `Authored entitlement fixture ${ordinal + 1}`,
                  body: `This is synthetic access-control fixture ${ordinal + 1}. It illustrates delivery of one server-defined detail from a permitted fictional source. It is not generated intelligence, new evidence, or a real incident finding.`,
                  kind: "authored_entitlement_fixture",
                  sensitive: false,
                  source: {
                    caseId:
                      sourceReceipt.cases[ordinal % sourceReceipt.cases.length]
                        .id,
                    version:
                      sourceReceipt.cases[ordinal % sourceReceipt.cases.length]
                        .version,
                  },
                }),
              )
            : [];
        const created: DetailBatch = {
          _id: id,
          ownerId,
          reportId,
          revision: report.revision,
          fingerprint,
          receipt: hash({ id, fingerprint }),
          sourceReceipt,
          details,
          createdAt: new Date(),
        };
        await this.batches.insertOne(created, { session });
        return created;
      }, transactionOptions),
    );
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        await this.current(ownerId, reportId, batch._id, session);
        const scope = this.billing.settings().scope,
          freeCount = freeDetailCount(batch.details.length),
          accesses = await this.accesses
            .find({ ownerId, scope, batchId: batch._id }, { session })
            .toArray();
        const details = [];
        for (const detail of batch.details) {
          const accessible =
            detail.ordinal < freeCount ||
            (await this.allowed(
              accesses.find((access) => access.detailId === detail.id) ?? null,
              ownerId,
              session,
            ));
          details.push({
            id: detail.id,
            title: detail.title,
            kind: detail.kind,
            sensitive: false,
            free: detail.ordinal < freeCount,
            unlocked: accessible,
            body: accessible ? detail.body : null,
            source: accessible ? detail.source : null,
          });
        }
        return {
          id: batch._id,
          reportId,
          revision: batch.revision,
          receipt: batch.receipt,
          kind: "authored_entitlement_fixture" as const,
          freeCount,
          total: details.length,
          details,
        };
      }, transactionOptions),
    );
  }
  async read(
    ownerId: string,
    reportId: string,
    batchId: string,
    detailId: string,
  ) {
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const { batch } = await this.current(
            ownerId,
            reportId,
            batchId,
            session,
          ),
          detail = batch.details.find((item) => item.id === detailId);
        if (!detail) throw new ServiceError(404, "detail_not_found");
        const access = await this.accesses.findOne(
          { ownerId, scope: this.billing.settings().scope, batchId, detailId },
          { session },
        );
        if (
          detail.ordinal >= freeDetailCount(batch.details.length) &&
          !(await this.allowed(access, ownerId, session))
        )
          throw new ServiceError(402, "detail_locked");
        return detail;
      }, transactionOptions),
    );
  }
  async unlock(
    ownerId: string,
    reportId: string,
    batchId: string,
    detailId: string,
    input: unknown,
  ) {
    const command = parse(detailCommand, input),
      scope = this.billing.settings().scope;
    return this.client.withSession((session) =>
      session.withTransaction(async () => {
        const { report, batch } = await this.current(
          ownerId,
          reportId,
          batchId,
          session,
        );
        if (
          report.revision !== command.expectedRevision ||
          batch.receipt !== command.receipt
        )
          throw new ServiceError(409, "intelligence_stale");
        const detail = batch.details.find((item) => item.id === detailId);
        if (!detail) throw new ServiceError(404, "detail_not_found");
        await this.billing.touchAccount(ownerId, scope, session);
        const existing = await this.consumptions.findOne(
          { ownerId, scope, key: command.key },
          { session },
        );
        if (existing) {
          if (existing.batchId !== batchId || existing.detailId !== detailId)
            throw new ServiceError(409, "idempotency_conflict");
          if (
            existing.grantId &&
            !(await this.billing.grants.findOne(
              { _id: existing.grantId, ownerId, scope, active: true },
              { session },
            ))
          )
            throw new ServiceError(402, "detail_locked");
          return { detail, charged: 0, reused: true };
        }
        const access = await this.accesses.findOne(
          { ownerId, scope, batchId, detailId },
          { session },
        );
        let charged = 0;
        let grantId: string | null;
        if (
          detail.ordinal >= freeDetailCount(batch.details.length) &&
          !(await this.allowed(access, ownerId, session))
        ) {
          const grant = await this.billing.grants.findOneAndUpdate(
            { ownerId, scope, active: true, remaining: { $gt: 0 } },
            { $inc: { remaining: -1 } },
            { session, returnDocument: "after", sort: { createdAt: 1 } },
          );
          if (!grant) throw new ServiceError(402, "detail_locked");
          charged = 1;
          grantId = grant._id;
        } else grantId = access?.grantId ?? null;
        await this.accesses.updateOne(
          { ownerId, scope, batchId, detailId },
          {
            $set: { grantId },
            $setOnInsert: { _id: randomUUID(), createdAt: new Date() },
          },
          { upsert: true, session },
        );
        await this.consumptions.insertOne(
          {
            _id: randomUUID(),
            ownerId,
            scope,
            key: command.key,
            batchId,
            detailId,
            grantId,
            charged,
            createdAt: new Date(),
          },
          { session },
        );
        await this.fence(report, batch, session);
        return { detail, charged, reused: !!access };
      }, transactionOptions),
    );
  }
}
