import { authenticated, response } from "@/server/http";
import { billingService } from "@/server/billing/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return authenticated(request, async (ownerId) =>
    response({ balance: await billingService().balance(ownerId) }),
  );
}
