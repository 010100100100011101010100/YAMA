import { z } from "zod";
import { authenticated, reportId, repository } from "@/server/http";
import { getGraphClient, GraphStore } from "@/server/database/graph";
import { getServerConfig } from "@/server/config";
import { readSharedEvidence } from "@/server/reports/shared-evidence";
import { ServiceError } from "@/server/errors";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; caseId: string }> }) {
  return authenticated(request, async owner => {
    const params = await context.params, url = new URL(request.url);
    const query = z.object({ revision: z.coerce.number().int().positive(), version: z.string().regex(/^[a-f0-9]{64}$/),
      caseId: z.string().regex(/^synthetic-[a-z0-9-]{1,80}$/) }).safeParse({ revision: url.searchParams.get("revision"), version: url.searchParams.get("version"), caseId: params.caseId });
    if (!query.success) throw new ServiceError(400, "invalid_request");
    const graph = new GraphStore(await getGraphClient(), getServerConfig().mongoDatabase);
    const bytes = await readSharedEvidence(repository(), graph, owner, reportId(params.id), query.data.caseId, query.data.revision, query.data.version);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="conversation-privacy-copy.png"', "Cross-Origin-Resource-Policy": "same-origin" } });
  });
}
