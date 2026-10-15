import { getAuth } from "@/server/auth";
import { getServerConfig } from "@/server/config";
import { response } from "@/server/http";

export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    if (request.method === "POST" && request.headers.get("origin") !== getServerConfig().origin) return response({ error: { code: "origin_rejected" } }, 403);
    const result = await getAuth().handler(request);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  } catch { return response({ error: { code: "authentication_unavailable" } }, 503); }
}
export const GET = handle;
export const POST = handle;
