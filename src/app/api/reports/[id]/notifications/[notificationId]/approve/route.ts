import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { NotificationService } from "@/server/notifications/service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; notificationId: string }> },
) {
  return authenticated(request, async (ownerId) => {
    const parameters = await context.params;
    const notification = await new NotificationService(
      getDatabase(),
      getMongoClient(),
    ).approve(
      ownerId,
      reportId(parameters.id),
      reportId(parameters.notificationId),
      await jsonBody(request),
    );
    return response(
      { notification },
      notification.status === "queued" ? 202 : 200,
    );
  });
}
