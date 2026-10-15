import {
  authenticated,
  jsonBody,
  reportId,
  response,
  repository,
} from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { VoiceService } from "@/server/voice/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (owner) => {
    const id = reportId((await context.params).id);
    await repository().get(owner, id);
    const current = await getDatabase()
      .collection<{
        _id: string;
        ownerId: string;
        id: string;
      }>("voice_sessions")
      .findOne({ _id: id, ownerId: owner });
    return response({
      session: current
        ? await new VoiceService(getDatabase(), getMongoClient()).get(
            owner,
            id,
            current.id,
          )
        : null,
    });
  });
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (owner) =>
    response({
      session: await new VoiceService(getDatabase(), getMongoClient()).control(
        owner,
        reportId((await context.params).id),
        await jsonBody(request),
      ),
    }),
  );
}
