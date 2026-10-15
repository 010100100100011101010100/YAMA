import { z } from "zod";
import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { parse } from "@/server/reports/domain";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { NotificationService } from "@/server/notifications/service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; notificationId: string }> },
) {
  return authenticated(request, async (ownerId) => {
    parse(z.strictObject({}), await jsonBody(request));
    const parameters = await context.params;
    return response({
      notification: await new NotificationService(
        getDatabase(),
        getMongoClient(),
      ).cancel(
        ownerId,
        reportId(parameters.id),
        reportId(parameters.notificationId),
      ),
    });
  });
}
