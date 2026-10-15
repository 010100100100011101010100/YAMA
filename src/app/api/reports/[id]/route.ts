import { authenticated, jsonBody, reportId, repository, response } from "@/server/http";
import { publicReport } from "@/server/reports/domain";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, async owner => response({ report: publicReport(await repository().get(owner, reportId((await context.params).id))) }));
}
export async function PATCH(request: Request, context: Context) {
  return authenticated(request, async owner => response({ report: publicReport(await repository().revise(owner, reportId((await context.params).id), await jsonBody(request))) }));
}
