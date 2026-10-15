import { authenticated, reportId, response } from "@/server/http";
import { evidenceId, evidenceService, type EvidenceContext } from "@/server/evidence/http";
import { publicEvidence } from "@/server/evidence/service";

export const runtime = "nodejs";
export async function POST(request: Request, context: EvidenceContext) {
  return authenticated(request, async owner => {
    const params = await context.params;
    const file = await evidenceService().extract(owner, reportId(params.id), evidenceId(params.evidenceId));
    return response({ evidence: publicEvidence(file) }, file.status === "queued" || file.status === "processing" ? 202 : 200);
  });
}
