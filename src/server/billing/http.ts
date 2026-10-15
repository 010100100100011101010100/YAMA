import "server-only";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { ServiceError } from "@/server/errors";
import { BillingService } from "./service";
import { IntelligenceService } from "./intelligence";
export const billingService = () =>
  new BillingService(getDatabase(), getMongoClient());
export const intelligenceService = () =>
  new IntelligenceService(getDatabase(), getMongoClient(), billingService());
export async function webhookBody(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new ServiceError(415, "json_required");
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "invalid_request");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const packet = await reader.read();
    if (packet.done) break;
    bytes += packet.value.length;
    if (bytes > 128 * 1024) {
      await reader.cancel();
      throw new ServiceError(413, "request_too_large");
    }
    chunks.push(packet.value);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw new ServiceError(400, "invalid_request");
  }
}
