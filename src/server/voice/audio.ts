import "server-only";
import { ServiceError } from "@/server/errors";
// The voice worker emits canonical 16-bit mono PCM WAV. Reject other formats,
// trailing data, empty payloads and oversized clips before sending to the browser.
export function inspectVoiceWave(bytes: Buffer) {
  if (
    bytes.length < 46 ||
    bytes.length > 3_000_044 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE" ||
    bytes.toString("ascii", 12, 16) !== "fmt " ||
    bytes.readUInt32LE(16) !== 16 ||
    bytes.readUInt16LE(20) !== 1 ||
    bytes.readUInt16LE(22) !== 1 ||
    bytes.readUInt32LE(24) !== 16000 ||
    bytes.readUInt32LE(28) !== 32000 ||
    bytes.readUInt16LE(32) !== 2 ||
    bytes.readUInt16LE(34) !== 16 ||
    bytes.toString("ascii", 36, 40) !== "data" ||
    bytes.readUInt32LE(40) !== bytes.length - 44 ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    (bytes.length - 44) % 2
  )
    throw new ServiceError(503, "invalid_voice_audio");
  const durationMs = (bytes.length - 44) / 32;
  if (durationMs > 90_000) throw new ServiceError(503, "voice_audio_limit");
  return { durationMs };
}
