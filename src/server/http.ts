import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@/server/auth";
import { getServerConfig } from "@/server/config";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { ServiceError } from "@/server/errors";
import { ReportRepository } from "@/server/reports/repository";

export function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export const repository = () => new ReportRepository(getDatabase(), getMongoClient());
export function reportId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new ServiceError(400, "invalid_report_id");
  return id;
}
export function creationKey(request: Request) {
  const key = request.headers.get("Idempotency-Key");
  if (!z.uuid().safeParse(key).success) throw new ServiceError(400, "idempotency_key_required");
  return key!;
}
export async function jsonBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ServiceError(415, "json_required");
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "invalid_request");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 128 * 1024) { await reader.cancel(); throw new ServiceError(413, "request_too_large"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new ServiceError(400, "invalid_json"); }
}
async function limit(ownerId: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const key = createHash("sha256").update(`${ownerId}:${minute}`).digest("hex");
  const limits = getDatabase().collection<{ _id: string; count: number; expiresAt: Date }>("api_limits");
  const count = await limits.findOneAndUpdate({ _id: key }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) },
  }, { upsert: true, returnDocument: "after" });
  if (!count || count.count > 120) throw new ServiceError(429, "rate_limited");
}
export async function authenticated(request: Request, action: (ownerId: string) => Promise<Response>) {
  try {
    if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== getServerConfig().origin) throw new ServiceError(403, "origin_rejected");
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) throw new ServiceError(401, "authentication_required");
    await limit(session.user.id);
    return await action(session.user.id);
  } catch (error) {
    if (error instanceof ServiceError) return response({ error: { code: error.code } }, error.status);
    // Driver messages, stack traces, and request bodies are intentionally not returned or logged.
    return response({ error: { code: "service_unavailable" } }, 503);
  }
}
