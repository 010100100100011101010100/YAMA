import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GraphStore } from "@/server/database/graph";
import { ServiceError } from "@/server/errors";
import { catalogueVersion, type CatalogueCase } from "./catalogue-policy";
import { getConnections } from "./connections";
import { sharedEvidenceImage } from "./disclosure";
import type { ReportRepository } from "./repository";
import { inspectVideo } from "@/server/evidence/video";

export async function readSharedEvidence(repository: ReportRepository, graph: Pick<GraphStore, "findConnections" | "readPatternSources">,
  ownerId: string, reportId: string, caseId: string, revision: number, version: string) {
  const comparison = await getConnections(repository, graph, ownerId, reportId);
  if (comparison.status !== "ready" || comparison.revision !== revision) throw new ServiceError(409, "revision_conflict");
  const candidate = comparison.candidates.find(candidate => candidate.id === caseId && candidate.explanation.catalogueVersion === version);
  if (!candidate?.evidence?.some(file => file.format === "png")) throw new ServiceError(404, "evidence_not_found");
  const entries = repository.database.collection<CatalogueCase>("catalogue");
  const entry = await entries.findOne({ _id: caseId, synthetic: true, published: true });
  if (!entry || catalogueVersion(entry) !== version) throw new ServiceError(409, "catalogue_changed");
  const bytes = await sharedEvidenceImage(entry, candidate.identifiers?.map(identifier => identifier.value));
  const current = await repository.get(ownerId, reportId);
  const latest = await entries.findOne({ _id: caseId, synthetic: true, published: true });
  if (current.revision !== revision || current.confirmation?.revision !== revision) throw new ServiceError(409, "revision_conflict");
  if (!latest || catalogueVersion(latest) !== version) throw new ServiceError(409, "catalogue_changed");
  return bytes;
}

export async function readSharedVideo(repository: ReportRepository, graph: Pick<GraphStore, "findConnections" | "readPatternSources">,
  ownerId: string, reportId: string, caseId: string, revision: number, version: string) {
  const comparison = await getConnections(repository, graph, ownerId, reportId);
  if (comparison.status !== "ready" || comparison.revision !== revision) throw new ServiceError(409, "revision_conflict");
  const candidate = comparison.candidates.find(candidate => candidate.id === caseId && candidate.explanation.catalogueVersion === version);
  const media = candidate?.media?.find(media => media.kind === "video");
  if (!media || media.kind !== "video") throw new ServiceError(404, "evidence_not_found");
  // A fixed authored asset; neither models nor callers can choose a file path.
  const bytes = await readFile(join(process.cwd(), "assets", "demo", "tracking-reconstruction.mp4"));
  if (createHash("sha256").update(bytes).digest("hex") !== media.sha256) throw new ServiceError(409, "integrity_failed");
  await inspectVideo(bytes);
  const current = await repository.get(ownerId, reportId);
  const latest = await repository.database.collection<CatalogueCase>("catalogue").findOne({ _id: caseId, synthetic: true, published: true });
  if (current.revision !== revision || current.confirmation?.revision !== revision) throw new ServiceError(409, "revision_conflict");
  if (!latest || catalogueVersion(latest) !== version) throw new ServiceError(409, "catalogue_changed");
  return bytes;
}
