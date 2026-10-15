import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { getDatabase } from "@/server/database/mongo";
import { ChatService } from "@/server/reports/chats";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (ownerId) =>
    response({
      status: await new ChatService(getDatabase()).get(
        ownerId,
        reportId((await context.params).id),
      ),
    }),
  );
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (ownerId) =>
    response({
      status: await new ChatService(getDatabase()).change(
        ownerId,
        reportId((await context.params).id),
        await jsonBody(request),
      ),
    }),
  );
}
