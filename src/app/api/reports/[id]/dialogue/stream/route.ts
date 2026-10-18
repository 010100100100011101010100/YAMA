import { authenticated, reportId } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { getAuth } from "@/server/auth";
import { DialogueService } from "@/server/dialogue/service";
import { dialogueStream } from "@/server/dialogue/stream";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticated(request, async owner => {
    const id = reportId((await context.params).id), service = new DialogueService(getDatabase(), getMongoClient());
    return dialogueStream(await service.get(owner, id), () => service.get(owner, id), request.signal,
      async () => (await getAuth().api.getSession({ headers: request.headers }))?.user.id === owner);
  });
}
