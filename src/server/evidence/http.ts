import "server-only";
import { join } from "node:path";
import { z } from "zod";
import { getServerConfig } from "@/server/config";
import { getDatabase, getMongoClient } from "@/server/database/mongo";
import { ServiceError } from "@/server/errors";
import { EvidenceFiles } from "./files";
import { EvidenceService } from "./service";

export type EvidenceContext = { params: Promise<{ id: string; evidenceId: string }> };
export function evidenceId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new ServiceError(400, "invalid_evidence_id");
  return id;
}
export const evidenceService = () => new EvidenceService(getDatabase(), getMongoClient(), new EvidenceFiles(join(process.cwd(), ".local", "evidence", getServerConfig().mongoDatabase)));
export function fileName(request: Request) {
  try { return decodeURIComponent(request.headers.get("X-File-Name") ?? ""); }
  catch { throw new ServiceError(400, "invalid_file_name"); }
}
