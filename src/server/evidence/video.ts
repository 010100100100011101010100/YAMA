import "server-only";
import { BufferSource, Input, MP4 } from "mediabunny";
import { ServiceError } from "@/server/errors";

export async function inspectVideo(bytes: Buffer) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new ServiceError(413, "file_too_large");
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
  try {
    const tracks = await input.getTracks(), videos = await input.getVideoTracks();
    if (tracks.length > 2 || videos.length !== 1 || await videos[0].getCodec() !== "avc") throw new ServiceError(415, "unsupported_file_type");
    const video = videos[0], width = await video.getDisplayWidth(), height = await video.getDisplayHeight();
    const duration = await input.computeDuration(undefined, { skipLiveWait: true });
    if (!Number.isFinite(duration) || duration <= 0 || duration > 90 || width <= 0 || height <= 0 || Math.max(width, height) > 1920 || width * height > 1920 * 1080) throw new ServiceError(422, "video_limit");
    return { width, height, duration };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(415, "unsupported_file_type");
  } finally { input.dispose(); }
}
