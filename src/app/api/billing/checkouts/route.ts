import { authenticated, jsonBody, response } from "@/server/http";
import { billingService } from "@/server/billing/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return authenticated(request, async (ownerId) =>
    response(
      {
        purchase: await billingService().createCheckout(
          ownerId,
          await jsonBody(request),
        ),
      },
      201,
    ),
  );
}
