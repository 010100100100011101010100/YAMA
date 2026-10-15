import "server-only";
import type { Db } from "mongodb";
import { ServiceError } from "@/server/errors";

type Budget = { _id: string; reservedCalls: number };
/** Reservations remain consumed after errors/cancel/crashes: a request may have been billed. */
export async function reserveProviderCall(database: Db, maximum: number) {
  const budgets = database.collection<Budget>("provider_budgets");
  await budgets.updateOne({ _id: "openai-synthetic-demo" }, { $setOnInsert: { reservedCalls: 0 } }, { upsert: true });
  const reserved = await budgets.findOneAndUpdate({ _id: "openai-synthetic-demo", reservedCalls: { $lt: maximum } },
    { $inc: { reservedCalls: 1 } }, { returnDocument: "after" });
  if (!reserved) throw new ServiceError(422, "provider_budget_exhausted");
}
