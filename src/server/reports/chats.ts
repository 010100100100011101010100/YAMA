import "server-only";
import type { Db } from "mongodb";
import { chatStatusCommand, type ChatStatus } from "@/lib/chat";
import { parse, type Report } from "./domain";
import { ServiceError } from "@/server/errors";
type StatusRecord = Omit<ChatStatus, "reportId"> & {
  _id: string;
  ownerId: string;
  updatedAt: Date;
};
export class ChatService {
  constructor(private readonly database: Db) {}
  private get statuses() {
    return this.database.collection<StatusRecord>("chat_statuses");
  }
  private async owned(ownerId: string, id: string) {
    if (
      !(await this.database
        .collection<Report>("reports")
        .findOne({ _id: id, ownerId }, { projection: { _id: 1 } }))
    )
      throw new ServiceError(404, "report_not_found");
  }
  private view(id: string, record: StatusRecord | null): ChatStatus {
    return {
      reportId: id,
      resolution: record?.resolution ?? "unresolved",
      version: record?.version ?? 0,
    };
  }
  async get(ownerId: string, id: string) {
    await this.owned(ownerId, id);
    return this.view(id, await this.statuses.findOne({ _id: id, ownerId }));
  }
  async list(ownerId: string) {
    const reports = await this.database
      .collection<Report>("reports")
      .find(
        { ownerId },
        {
          projection: {
            _id: 1,
            revision: 1,
            language: 1,
            confirmation: 1,
            createdAt: 1,
            updatedAt: 1,
            messages: { $slice: 1 },
          },
        },
      )
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    const statuses = await this.statuses
      .find({ ownerId, _id: { $in: reports.map((report) => report._id) } })
      .toArray();
    return reports.map((report) => {
      const status = statuses.find((item) => item._id === report._id);
      return {
        _id: report._id,
        revision: report.revision,
        language: report.language,
        confirmation: report.confirmation,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        title: (report.messages[0]?.text ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 96),
        resolution: status?.resolution ?? "unresolved",
        statusVersion: status?.version ?? 0,
      };
    });
  }
  async change(ownerId: string, id: string, input: unknown) {
    const command = parse(chatStatusCommand, input);
    await this.owned(ownerId, id);
    const current = await this.statuses.findOne({ _id: id, ownerId });
    if ((current?.resolution ?? "unresolved") === command.resolution)
      return this.view(id, current);
    if ((current?.version ?? 0) !== command.expectedVersion)
      throw new ServiceError(409, "chat_status_conflict");
    if (!current) {
      try {
        await this.statuses.insertOne({
          _id: id,
          ownerId,
          resolution: command.resolution,
          version: 1,
          updatedAt: new Date(),
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    } else
      await this.statuses.updateOne(
        { _id: id, ownerId, version: command.expectedVersion },
        {
          $set: { resolution: command.resolution, updatedAt: new Date() },
          $inc: { version: 1 },
        },
      );
    const saved = await this.statuses.findOne({ _id: id, ownerId });
    if (saved?.resolution !== command.resolution)
      throw new ServiceError(409, "chat_status_conflict");
    return this.view(id, saved);
  }
}
