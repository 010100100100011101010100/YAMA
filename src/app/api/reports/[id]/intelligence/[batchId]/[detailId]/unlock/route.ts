import { authenticated, reportId, jsonBody, response } from "@/server/http";
import { intelligenceService } from "@/server/billing/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string; batchId: string; detailId: string }>;
  },
) {
  return authenticated(request, async (ownerId) => {
    const { id, batchId, detailId } = await context.params;
    return response(
      await intelligenceService().unlock(
        ownerId,
        reportId(id),
        reportId(batchId),
        reportId(detailId),
        await jsonBody(request),
      ),
    );
  });
}
