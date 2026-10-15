import { response } from "@/server/http";
import { voiceSettings, VOICE_SPEAKERS } from "@/server/voice/config";
export const runtime = "nodejs";
export async function GET() {
  try {
    const settings = voiceSettings();
    return response({
      enabled: true,
      seconds: settings.seconds,
      speakers: VOICE_SPEAKERS,
    });
  } catch {
    return response({ enabled: false, seconds: 120, speakers: VOICE_SPEAKERS });
  }
}
