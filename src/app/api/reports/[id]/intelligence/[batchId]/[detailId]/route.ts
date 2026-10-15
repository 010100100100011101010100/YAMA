import { authenticated, reportId, response } from "@/server/http";
import { intelligenceService } from "@/server/billing/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string; batchId: string; detailId: string }>;
  },
) {
  return authenticated(request, async (ownerId) => {
    const { id, batchId, detailId } = await context.params;
    return response({
      detail: await intelligenceService().read(
        ownerId,
        reportId(id),
        reportId(batchId),
        reportId(detailId),
      ),
    });
  });
}
