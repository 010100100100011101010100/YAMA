import { authenticated, reportId } from "@/server/http";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { VoiceService } from "@/server/voice/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authenticated(request, async (owner) => {
    const clipId = new URL(request.url).searchParams.get("clipId") ?? "";
    const audio = await new VoiceService(getDatabase(), getMongoClient()).audio(
      owner,
      reportId((await context.params).id),
      clipId,
    );
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
