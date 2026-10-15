import { authenticated, jsonBody, reportId, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { VoiceService } from "@/server/voice/service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (owner) =>
    response(
      await new VoiceService(getDatabase(), getMongoClient()).playback(
        owner,
        reportId((await context.params).id),
        await jsonBody(request),
      ),
    ),
  );
}
