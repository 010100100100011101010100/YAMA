import { billingService, webhookBody } from "@/server/billing/http";
import { ServiceError } from "@/server/errors";
import { response } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await webhookBody(request),
      headers = Object.fromEntries(
        ["webhook-id", "webhook-signature", "webhook-timestamp"].map((name) => [
          name,
          request.headers.get(name) ?? "",
        ]),
      );
    return response(await billingService().receiveWebhook(raw, headers));
  } catch (error) {
    if (error instanceof ServiceError)
      return response({ error: { code: error.code } }, error.status);
    return response({ error: { code: "service_unavailable" } }, 503);
  }
}
