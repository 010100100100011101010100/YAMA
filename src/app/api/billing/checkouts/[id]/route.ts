import { authenticated, reportId, response } from "@/server/http";
import { billingService } from "@/server/billing/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (ownerId) =>
    response({
      purchase: await billingService().getPurchase(
        ownerId,
        reportId((await context.params).id),
      ),
    }),
  );
}
