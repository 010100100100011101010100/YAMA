import "server-only";
import { createHash } from "node:crypto";
import { ServiceError } from "@/server/errors";
import { uploadFormat } from "@/lib/evidence-format";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export function inspectUpload(name: string, type: string, bytes: Buffer) {
  // Reject control characters and directional overrides in user-supplied filenames.
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 120 || /[\\/:\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(name)) throw new ServiceError(400, "invalid_file_name");
  const format = uploadFormat(name);
  if (!format) throw new ServiceError(400, "invalid_file_name");
  if (type.split(";")[0].trim().toLowerCase() !== format.mime) throw new ServiceError(415, "unsupported_file_type");
  if (!bytes.length || bytes.length > format.limit) throw new ServiceError(413, "file_too_large");
  const prefix = bytes.subarray(0, 8).toString("latin1");
  // Binary signatures contain intentional control bytes.
  // eslint-disable-next-line no-control-regex
  const binary = /^(%PDF-|\x89PNG|\xff\xd8\xff|GIF8|PK\x03\x04|MZ|\x7fELF)/.test(prefix);
  const matches = format.format === "text" ? !binary : format.format === "pdf" ? prefix.startsWith("%PDF-")
    : format.format === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0, 3).equals(Buffer.from([255,216,255]));
  if (!matches) throw new ServiceError(415, "unsupported_file_type");
  return { name, format: format.format, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export function extractText(bytes: Buffer) {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new ServiceError(422, "invalid_utf8"); }
  // Plain text may contain tabs and line endings, but no other control bytes.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new ServiceError(422, "binary_content");
  if (!text.trim()) throw new ServiceError(422, "empty_text");
  if (text.length > 6000) throw new ServiceError(422, "text_limit");
  return text;
}

export async function uploadBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "empty_upload");
  const chunks: Uint8Array[] = []; let size = 0; let expired = false;
  const timeout = setTimeout(() => { expired = true; void reader.cancel().catch(() => undefined); }, 10_000);
  try {
    while (true) {
      request.signal.throwIfAborted();
      const next = await reader.read();
      // Cancellation can occur while read() is waiting for the final chunk.
      request.signal.throwIfAborted(); if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new ServiceError(413, "file_too_large"); }
      chunks.push(next.value);
    }
    if (expired) throw new ServiceError(408, "upload_timeout");
    if (!chunks.length) throw new ServiceError(400, "empty_upload");
    return Buffer.concat(chunks);
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}
