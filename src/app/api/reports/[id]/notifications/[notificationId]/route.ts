import { authenticated, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { NotificationService } from "@/server/notifications/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; notificationId: string }> },
) {
  return authenticated(request, async (ownerId) => {
    const parameters = await context.params;
    return response({
      notification: await new NotificationService(
        getDatabase(),
        getMongoClient(),
      ).get(
        ownerId,
        reportId(parameters.id),
        reportId(parameters.notificationId),
      ),
    });
  });
}
