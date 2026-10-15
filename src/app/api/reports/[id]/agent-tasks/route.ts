import { authenticated, creationKey, jsonBody, reportId, response } from "@/server/http";
import { agentTaskService } from "@/server/agents/http";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => response({ tasks: await agentTaskService().list(owner, reportId((await context.params).id)) }));
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => response({ task: await agentTaskService().enqueue(owner, reportId((await context.params).id), await jsonBody(request), creationKey(request)) }, 202));
}
