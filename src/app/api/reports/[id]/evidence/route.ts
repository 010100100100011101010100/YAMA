import { authenticated, creationKey, reportId, repository, response } from "@/server/http";
import { uploadBody } from "@/server/evidence/domain";
import { evidenceService, fileName } from "@/server/evidence/http";
import { publicEvidence } from "@/server/evidence/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, async owner => response({ evidence: await evidenceService().list(owner, reportId((await context.params).id)) }));
}
export async function POST(request: Request, context: Context) {
  return authenticated(request, async owner => {
    const id = reportId((await context.params).id); await repository().get(owner, id);
    const key = creationKey(request), name = fileName(request);
    const file = await evidenceService().upload(owner, id, key, name, request.headers.get("Content-Type") ?? "", await uploadBody(request));
    return response({ evidence: publicEvidence(file) }, 201);
  });
}
