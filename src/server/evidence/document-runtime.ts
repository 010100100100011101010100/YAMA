import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceFormat } from "@/lib/evidence-format";
import { ServiceError } from "@/server/errors";
import { validateDocumentOutput } from "./document-output";

const execute = promisify(execFile);
const parserErrors = new Set(["processing_timeout", "document_malformed", "encrypted_pdf", "page_limit", "image_limit", "animated_image", "text_limit", "unsupported_file_type"]);
export type DocumentParser = (bytes: Buffer, format: Exclude<EvidenceFormat, "text">, signal: AbortSignal) => Promise<ReturnType<typeof validateDocumentOutput>>;

export const parseDocument: DocumentParser = async (bytes, format, signal) => {
  let image: string;
  try {
    const manifest: unknown = JSON.parse(await readFile(join(process.cwd(), ".local/evidence-runtime.json"), "utf8"));
    image = (manifest as { image?: string }).image ?? "";
    if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Invalid runtime");
  } catch { throw new ServiceError(503, "runtime_unavailable"); }
  signal.throwIfAborted();
  const root = join(process.cwd(), ".local/evidence-work");
  await mkdir(root, { recursive: true, mode: 0o700 }); await chmod(root, 0o700);
  const directory = await mkdtemp(join(root, "job-")), input = join(directory, "document");
  const name = `yama-evidence-${randomUUID()}`, localDocker = join(process.cwd(), ".local/runtime/bin/docker"), docker = existsSync(localDocker) ? localDocker : "docker";
  const deadline = AbortSignal.timeout(60_000), abort = AbortSignal.any([signal, deadline]);
  try {
    // Only this generated file is mounted. Its private parent is inaccessible to other host users.
    await writeFile(input, bytes, { mode: 0o444, flag: "wx" });
    const { stdout } = await execute(docker, ["--context", "colima-yama", "run", "--rm", "--init", "--pull", "never", "--name", name,
      "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--memory", "384m", "--memory-swap", "384m",
      "--cpus", "0.75", "--pids-limit", "64", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
      "--mount", `type=bind,source=${input},target=/input/document,readonly`, image, format],
    { signal: abort, timeout: 65_000, maxBuffer: 64 * 1024, encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: process.env.NODE_ENV } });
    let payload: unknown;
    try { payload = JSON.parse(stdout); } catch { throw new ServiceError(422, "document_malformed"); }
    const error = (payload as { error?: unknown })?.error;
    if (typeof error === "string" && parserErrors.has(error)) throw new ServiceError(422, error);
    return validateDocumentOutput(payload, image);
  } catch (error) {
    if (signal.aborted) throw new ServiceError(409, "processing_canceled");
    if (deadline.aborted) throw new ServiceError(422, "processing_timeout");
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(503, "processing_failed");
  } finally {
    // Killing the Docker client alone does not stop its container.
    await execute(docker, ["--context", "colima-yama", "rm", "-f", name], { timeout: 5000, maxBuffer: 4096 }).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
};
