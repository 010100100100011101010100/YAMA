import { authenticated, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { NotificationService } from "@/server/notifications/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (ownerId) => {
    const id = reportId((await context.params).id),
      service = new NotificationService(getDatabase(), getMongoClient());
    await service.report(ownerId, id);
    const records = await service.jobs
      .find({ ownerId, reportId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    return response({
      notifications: records.map((record) => service.view(record)),
    });
  });
}
