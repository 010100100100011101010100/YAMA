import { authenticated, reportId, repository, response } from "@/server/http";
import { getGraphClient, GraphStore } from "@/server/database/graph";
import { getServerConfig } from "@/server/config";
import { getConnections } from "@/server/reports/connections";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => {
    const store = async () => new GraphStore(await getGraphClient(), getServerConfig().mongoDatabase);
    const graph = { findConnections: async (...args: Parameters<GraphStore["findConnections"]>) => (await store()).findConnections(...args),
      readPatternSources: async (owner: string, id: string, revision: number) => (await store()).readPatternSources(owner, id, revision) };
    const result = await getConnections(repository(), graph, owner, reportId((await context.params).id));
    return response(result, result.status === "pending" ? 202 : 200);
  });
}
