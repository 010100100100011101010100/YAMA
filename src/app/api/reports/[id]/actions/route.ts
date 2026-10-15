import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { ActionService } from "@/server/actions/service";
export const runtime = "nodejs";
const service = () => new ActionService(getDatabase(), getMongoClient());
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => response(await service().preview(owner, reportId((await context.params).id))));
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => response(await service().review(owner, reportId((await context.params).id), await jsonBody(request))));
}
