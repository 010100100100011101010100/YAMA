import { authenticated, reportId, response } from "@/server/http";
import { ServiceError } from "@/server/errors";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { NotificationService } from "@/server/notifications/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (ownerId) => {
    if (new URL(request.url).search)
      throw new ServiceError(400, "invalid_request");
    return response({
      notification: await new NotificationService(
        getDatabase(),
        getMongoClient(),
      ).preview(ownerId, reportId((await context.params).id)),
    });
  });
}
