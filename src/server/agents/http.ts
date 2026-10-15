import "server-only";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { reportId } from "@/server/http";
import { AgentTaskService } from "./service";

export type AgentTaskContext = { params: Promise<{ id: string; taskId: string }> };
export const agentTaskService = () => new AgentTaskService(getDatabase(), getMongoClient());
export async function taskReferences(context: AgentTaskContext) {
  const params = await context.params;
  return { report: reportId(params.id), task: reportId(params.taskId) };
}
