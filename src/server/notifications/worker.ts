import "server-only";
import { randomUUID } from "node:crypto";
import { NotificationService } from "./service";
import {
  notificationOutcomeSchema,
  notificationPayload,
  runNotification,
  type NotificationRunner,
} from "./runtime";
export class NotificationWorker {
  constructor(
    readonly service: NotificationService,
    private readonly run: NotificationRunner = runNotification,
  ) {}
  async runOnce(signal: AbortSignal = new AbortController().signal) {
    if (signal.aborted) return false;
    const token = randomUUID(),
      claimed = await this.service.claim(token);
    if (!claimed) return false;
    try {
      if (!claimed.record) return true;
      const record = claimed.record,
        deadline = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
      try {
        const raw =
          record.provider === "fixture"
            ? { outcome: "captured", providerRef: record._id }
            : await this.run(
                record.provider,
                notificationPayload(record),
                claimed.settings,
                deadline,
              );
        // Even after cancellation, a valid acceptance acknowledgement is historical truth.
        const result = notificationOutcomeSchema.parse(raw);
        if (record.provider !== "fixture" && result.outcome === "captured")
          throw new Error("invalid_capture");
        await this.service.finish(record, token, result);
      } catch {
        await this.service.unknown(record, token);
      }
    } finally {
      await this.service.release(token);
    }
    return true;
  }
}
