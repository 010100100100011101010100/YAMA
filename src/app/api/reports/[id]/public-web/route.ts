import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { PublicWebService } from "@/server/public-web/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return authenticated(request, async (ownerId) => {
    const id = reportId((await context.params).id);
    const job = await new PublicWebService(
      getDatabase(),
      getMongoClient(),
    ).start(ownerId, id, await jsonBody(request));
    return response({ job }, job.status === "ready" ? 200 : 202);
  });
}
export async function GET(request: Request, context: Context) {
  return authenticated(request, async (ownerId) => {
    const id = reportId((await context.params).id),
      service = new PublicWebService(getDatabase(), getMongoClient());
    await service.report(ownerId, id);
    const records = await service.jobs
      .find({ ownerId, reportId: id }, { projection: { _id: 1 } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    const jobs = [];
    for (const record of records)
      jobs.push(await service.get(ownerId, id, record._id));
    return response({ jobs });
  });
}
