import { z } from "zod";
import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { parse } from "@/server/reports/domain";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { PublicWebService } from "@/server/public-web/service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; jobId: string }> },
) {
  return authenticated(request, async (ownerId) => {
    parse(z.strictObject({}), await jsonBody(request));
    const parameters = await context.params;
    return response({
      job: await new PublicWebService(getDatabase(), getMongoClient()).cancel(
        ownerId,
        reportId(parameters.id),
        reportId(parameters.jobId),
      ),
    });
  });
}
