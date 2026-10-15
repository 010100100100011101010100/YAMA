import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { evidenceId, evidenceService, type EvidenceContext } from "@/server/evidence/http";
import { publicReport } from "@/server/reports/domain";

export const runtime = "nodejs";
export async function POST(request: Request, context: EvidenceContext) {
  return authenticated(request, async owner => {
    const params = await context.params;
    return response({ report: publicReport(await evidenceService().review(owner, reportId(params.id), evidenceId(params.evidenceId), await jsonBody(request))) });
  });
}
