import { authenticated, reportId, response } from "@/server/http";
import { evidenceId, evidenceService, type EvidenceContext } from "@/server/evidence/http";
import { publicEvidence } from "@/server/evidence/service";

export const runtime = "nodejs";
export async function GET(request: Request, context: EvidenceContext) {
  return authenticated(request, async owner => {
    const params = await context.params;
    return response({ evidence: publicEvidence(await evidenceService().get(owner, reportId(params.id), evidenceId(params.evidenceId))) });
  });
}
export async function DELETE(request: Request, context: EvidenceContext) {
  return authenticated(request, async owner => {
    const params = await context.params;
    await evidenceService().remove(owner, reportId(params.id), evidenceId(params.evidenceId));
    return response({ removed: true });
  });
}
