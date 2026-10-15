import { authenticated, jsonBody, reportId, repository, response } from "@/server/http";
import { publicReport } from "@/server/reports/domain";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => response({ report: publicReport(await repository().confirm(owner, reportId((await context.params).id), await jsonBody(request))) }));
}
