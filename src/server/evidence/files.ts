import "server-only";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ServiceError } from "@/server/errors";
import { MAX_UPLOAD_BYTES } from "./domain";

export class EvidenceFiles {
  constructor(readonly root: string) {}
  private async path(id: string) {
    if (!z.uuid().safeParse(id).success) throw new ServiceError(400, "invalid_evidence_id");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.root);
    if (!directory.isDirectory() || directory.isSymbolicLink() || await realpath(this.root) !== resolve(this.root)) throw new ServiceError(503, "file_store_unavailable");
    await chmod(this.root, 0o700);
    return join(this.root, `${id}.blob`);
  }
  async write(id: string, bytes: Buffer) {
    const file = await open(await this.path(id), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  }
  async read(id: string) {
    try {
      const file = await open(await this.path(id), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > MAX_UPLOAD_BYTES) throw new Error("Invalid blob");
        const bytes = Buffer.alloc(MAX_UPLOAD_BYTES + 1); let size = 0;
        while (size < bytes.length) {
          const read = await file.read(bytes, size, bytes.length - size, size);
          if (!read.bytesRead) break; size += read.bytesRead;
        }
        if (size > MAX_UPLOAD_BYTES) throw new Error("Oversized blob");
        return bytes.subarray(0, size);
      } finally { await file.close(); }
    } catch { throw new ServiceError(503, "file_unavailable"); }
  }
  async discard(id: string) { await unlink(await this.path(id)); }
}
