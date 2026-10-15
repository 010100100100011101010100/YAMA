import { response } from "@/server/http";
import { getDatabase } from "@/server/database/mongo";
import { getGraphClient } from "@/server/database/graph";

export const runtime = "nodejs";
export async function GET() {
  try {
    const checks = await Promise.allSettled([getDatabase().command({ ping: 1 }), getGraphClient().then(client => client.list())]);
    const ready = checks.every(check => check.status === "fulfilled");
    return response({ status: ready ? "ready" : "unavailable", mode: "synthetic_localhost" }, ready ? 200 : 503);
  } catch { return response({ status: "unavailable", mode: "synthetic_localhost" }, 503); }
}
