import { getServerConfig } from "@/server/config";
export const runtime = "nodejs";
// Provider return parameters never authorize a grant and are not copied or logged.
export async function GET() {
  return new Response(null, {
    status: 303,
    headers: {
      Location: getServerConfig().origin + "/",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
