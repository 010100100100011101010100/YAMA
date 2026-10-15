import { authenticated, reportId, response } from "@/server/http";
import { evidenceId, evidenceService, type EvidenceContext } from "@/server/evidence/http";

export const runtime = "nodejs";
export async function GET(request: Request, context: EvidenceContext) {
  return authenticated(request, async owner => {
    const params = await context.params;
    return response({ source: await evidenceService().source(owner, reportId(params.id), evidenceId(params.evidenceId)) });
  });
}
