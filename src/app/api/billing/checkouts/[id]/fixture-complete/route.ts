import { authenticated, reportId, jsonBody, response } from "@/server/http";
import { billingService } from "@/server/billing/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (ownerId) =>
    response(
      {
        purchase: await billingService().completeFixture(
          ownerId,
          reportId((await context.params).id),
          await jsonBody(request),
        ),
      },
      202,
    ),
  );
}
