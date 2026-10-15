import { authenticated, creationKey, jsonBody, repository, response } from "@/server/http";
import { getDatabase } from "@/server/database/mongo";
import { ChatService } from "@/server/reports/chats";
import { publicReport } from "@/server/reports/domain";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return authenticated(request, async owner => response({ reports: await new ChatService(getDatabase()).list(owner) }));
}
export async function POST(request: Request) {
  return authenticated(request, async owner => response({ report: publicReport(await repository().create(owner, await jsonBody(request), creationKey(request))) }, 201));
}
