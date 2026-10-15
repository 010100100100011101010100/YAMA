import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
import { BillingService } from "./service";
import { runBillingProvider, type BillingRunner } from "./runtime";
export class BillingWorker {
  constructor(
    readonly service: BillingService,
    private readonly run: BillingRunner = runBillingProvider,
  ) {}
  async runOnce(signal: AbortSignal = new AbortController().signal) {
    if (signal.aborted) return false;
    const token = randomUUID(),
      claimed = await this.service.claim(token);
    if (!claimed) return false;
    const { record, settings } = claimed;
    try {
      let payment: unknown;
      if (settings.test) {
        await this.service.reserveCalls(1, settings);
        const output = await this.run(
          "read_payment",
          { paymentId: record.event.paymentId },
          settings,
          AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        );
        payment = z.object({ payment: z.unknown() }).parse(output).payment;
      } else
        payment = (
          await this.service.purchases.findOne({
            scope: "fixture",
            "fixturePayment.paymentId": record.event.paymentId,
          })
        )?.fixturePayment;
      await this.service.applyPayment(record, token, payment);
    } catch (error) {
      await this.service.fail(
        record,
        token,
        error instanceof ServiceError && error.code === "payment_mismatch",
      );
    } finally {
      await this.service.release(token);
    }
    return true;
  }
}
