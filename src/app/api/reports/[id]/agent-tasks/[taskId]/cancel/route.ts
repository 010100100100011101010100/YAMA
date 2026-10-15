import { authenticated, response } from "@/server/http";
import { agentTaskService, taskReferences, type AgentTaskContext } from "@/server/agents/http";

export const runtime = "nodejs";
export async function POST(request: Request, context: AgentTaskContext) {
  return authenticated(request, async owner => {
    const references = await taskReferences(context);
    return response({ task: await agentTaskService().cancel(owner, references.report, references.task) });
  });
}
