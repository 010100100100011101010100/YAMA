import { authenticated, jsonBody, response } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { VoiceService } from "@/server/voice/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return authenticated(request, async (owner) =>
    response(
      await new VoiceService(getDatabase(), getMongoClient()).start(
        owner,
        await jsonBody(request),
      ),
    ),
  );
}
