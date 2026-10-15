import { authenticated, reportId, response } from "@/server/http";
import { intelligenceService } from "@/server/billing/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (ownerId) =>
    response({
      intelligence: await intelligenceService().preview(
        ownerId,
        reportId((await context.params).id),
      ),
    }),
  );
}
