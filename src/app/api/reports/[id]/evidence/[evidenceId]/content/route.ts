import { authenticated, reportId } from "@/server/http";
import { evidenceId, evidenceService, type EvidenceContext } from "@/server/evidence/http";

export const runtime = "nodejs";
export async function GET(request: Request, context: EvidenceContext) {
  return authenticated(request, async owner => {
    const params = await context.params;
    const content = await evidenceService().content(owner, reportId(params.id), evidenceId(params.evidenceId));
    return new Response(new Uint8Array(content.bytes), { headers: { "Content-Type": content.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'inline; filename="evidence-image"', "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  });
}
