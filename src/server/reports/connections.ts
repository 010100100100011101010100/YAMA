import "server-only";
import type { GraphStore, CatalogueCase } from "@/server/database/graph";
import { ServiceError } from "@/server/errors";
import { matchingPatterns } from "./domain";
import { jobKey, type GraphJob, type ReportRepository } from "./repository";
import { CONNECTION_RECIPE, connectionsSchema, type ConnectionsResult } from "@/lib/connections";
import { explainPatternSources } from "./connection-explanation";
import { catalogueSchema, catalogueVersion } from "./catalogue-policy";
import { contactKey, identifierSources, matchingIdentifiers } from "./identifiers";
import { discloseCatalogueCase } from "./disclosure";
import { reportDetails, catalogueDetails } from "./retrieval-details";
import { reportSemanticText, catalogueSemanticText, semanticHash, SEMANTIC_MODEL, SEMANTIC_REVISION } from "./semantic";

export async function getConnections(repository: ReportRepository, graph: Pick<GraphStore, "findConnections" | "readPatternSources">, ownerId: string, id: string): Promise<ConnectionsResult> {
  const report = await repository.get(ownerId, id);
  if (report.confirmation?.revision !== report.revision) throw new ServiceError(409, "confirmation_required");
  const job = await repository.database.collection<GraphJob>("graph_outbox").findOne({ _id: jobKey(report), ownerId });
  if (job?.status === "failed") throw new ServiceError(503, "projection_failed");
  if (job?.status !== "done") return { status: "pending", reportId: id, revision: report.revision, recipe: CONNECTION_RECIPE, sources: [], candidates: [] };
  const details = reportDetails(report);
  const semanticQuery = process.env.YAMA_SEMANTIC_RETRIEVAL_ENABLED === "true" ? reportSemanticText(report) : "";
  const matches = await graph.findConnections(ownerId, id, report.revision, details.map(detail => detail.key), semanticQuery);
  const sources = explainPatternSources(report);
  const patterns = matchingPatterns(report);
  const contacts = matchingIdentifiers(report);
  const contactSources = identifierSources(report);
  const paths = await graph.readPatternSources(ownerId, id, report.revision);
  // Mongo is canonical. A missing, duplicated or altered graph path cannot be cited.
  if (paths.length !== sources.length || new Set(paths.map(path => path.assertionId)).size !== paths.length || sources.some(source => {
    const path = paths.find(path => path.assertionId === source.assertionId);
    return !path || path.traversable !== patterns.includes(source.value) || path.value !== source.value || path.originalValue !== source.originalValue || path.origin !== source.origin || path.included !== source.included || path.polarity !== source.polarity
      || path.messageId !== source.source.messageId || path.start !== source.source.start || path.end !== source.source.end
      || path.evidenceId !== (source.evidence?.id ?? "") || path.sha256 !== (source.evidence?.sha256 ?? "") || path.textSha256 !== (source.evidence?.textSha256 ?? "");
  })) throw new ServiceError(503, "projection_invalid");
  const entries = await repository.database.collection<CatalogueCase>("catalogue").find({ _id: { $in: matches.map(match => match.id) }, synthetic: true, published: true }).toArray();
  // An edit while FalkorDB was answering must not expose results for the old revision.
  const latest = await repository.get(ownerId, id);
  if (latest.revision !== report.revision || latest.confirmation?.revision !== report.revision) throw new ServiceError(409, "revision_conflict");
  const items = report.assertions.filter(assertion => assertion.included && assertion.polarity === "affirmed" && assertion.field === "item");
  return connectionsSchema.parse({ status: "ready", reportId: id, revision: report.revision, recipe: CONNECTION_RECIPE, sources, identifierSources: contactSources,
    candidates: matches.flatMap(match => {
      const entry = entries.find(entry => entry._id === match.id);
      if (!entry) return [];
      if (!catalogueSchema.safeParse(entry).success) throw new ServiceError(503, "catalogue_changed");
      if (match.version !== catalogueVersion(entry)) throw new ServiceError(503, "catalogue_changed");
      const shared = patterns.filter(key => match.sharedPatterns.includes(key) && entry.patterns.some(pattern => pattern === key));
      const sharedContacts = (entry.identifiers ?? []).filter(identifier => identifier.polarity === "affirmed" && (match.sharedIdentifiers ?? []).includes(contactKey(identifier.kind, identifier.value))
        && contacts.some(source => source.key === contactKey(identifier.kind, identifier.value)));
      const sharedDetails = catalogueDetails(entry).filter(detail => (match.sharedDetails ?? []).includes(detail.key) && details.some(source => source.key === detail.key));
      const semantic = match.semantic;
      if (semantic && (!semanticQuery || semantic.model !== SEMANTIC_MODEL || semantic.revision !== SEMANTIC_REVISION
        || semantic.documentHash !== semanticHash(catalogueSemanticText(entry)) || semantic.queryHash !== semanticHash(semanticQuery))) throw new ServiceError(503, "projection_invalid");
      if ((!shared.length && !sharedContacts.length && !sharedDetails.length && !semantic) || shared.length !== new Set(match.sharedPatterns).size
        || sharedContacts.length !== new Set(match.sharedIdentifiers ?? []).size || sharedDetails.length !== new Set(match.sharedDetails ?? []).size) throw new ServiceError(503, "projection_invalid");
      const disclosed = discloseCatalogueCase(entry, sharedContacts.map(identifier => identifier.value));
      return [{ id: entry._id, title: disclosed.title, summary: disclosed.summary, synthetic: true,
        ...(semantic ? { semantic: { basis: "narrative_similarity", query: semanticQuery, quote: discloseCatalogueCase(entry).summary } } : {}),
        ...(disclosed.media ? { media: disclosed.media } : {}),
        ...(entry.harmCategories ? { harmCategories: entry.harmCategories } : {}),
        pattern: { shared, different: entry.patterns.filter(key => !patterns.includes(key)), basis: "confirmed_pattern_tags" },
        ...(sharedDetails.length ? { details: sharedDetails.map(detail => ({ ...details.find(source => source.key === detail.key)!, catalogueQuote: detail.quote })) } : {}),
        ...(entry.identifiers ? { identifiers: sharedContacts.map(identifier => {
          const source = contacts.find(source => source.key === contactKey(identifier.kind, identifier.value))!;
          return { kind: identifier.kind, value: source.value, assertionIds: [...new Set(contacts.filter(contact => contact.key === source.key).map(contact => contact.assertionId))], quote: source.quote, source: source.source, catalogueSource: identifier.source };
        }) } : {}),
        ...(disclosed.resolution ? { resolution: disclosed.resolution } : {}), ...(disclosed.evidence ? { evidence: disclosed.evidence } : {}),
        linkage: { status: sharedContacts.length ? "possible_shared_identifier" : "not_assessed", explanation: sharedContacts.length
          ? "The same contact appears in both reports. An account can be shared, copied or reassigned, so this does not confirm who used it."
          : sharedDetails.length ? "A shared detail was used to retrieve this report for review. It does not establish a shared person or organization."
            : shared.length ? "A shared pattern does not establish a shared person or organization."
              : "The accounts describe similar events. Semantic similarity does not establish a shared contact, person or organization." },
        explanation: { catalogueVersion: match.version, sourceKind: "authored_synthetic", paths: shared.map(pattern => ({ pattern,
          assertionIds: sources.filter(source => source.value === pattern && source.status === "supporting").map(source => source.assertionId) })) },
        differences: items.length && !items.some(item => item.value.toLowerCase() === entry.item) ? ["The reported item differs from this report."] : [],
      }];
    }),
  });
}
