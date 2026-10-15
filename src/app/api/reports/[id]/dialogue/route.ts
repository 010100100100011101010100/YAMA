import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { DialogueService } from "@/server/dialogue/service";

export const runtime = "nodejs";
const service = () => new DialogueService(getDatabase(), getMongoClient());
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => response({ dialogue: await service().get(owner, reportId((await context.params).id)) }));
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => response({ dialogue: await service().change(owner, reportId((await context.params).id), await jsonBody(request)) }));
}
