import { authenticated, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { PublicWebService } from "@/server/public-web/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; jobId: string }> },
) {
  return authenticated(request, async (ownerId) => {
    const parameters = await context.params;
    return response({
      job: await new PublicWebService(getDatabase(), getMongoClient()).get(
        ownerId,
        reportId(parameters.id),
        reportId(parameters.jobId),
      ),
    });
  });
}
