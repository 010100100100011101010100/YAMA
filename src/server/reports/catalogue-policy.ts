import "server-only";
import { createHash } from "node:crypto";
import type { Db, ClientSession } from "mongodb";
import { z } from "zod";
import { patternSchema, type ConnectionReceipt } from "@/lib/connections";
import { caseResolutionSchema, caseEvidenceSchema, caseMediaSchema, identifierKindSchema, contactSourceSchema, harmCategoriesSchema } from "@/lib/case-identifiers";

export const catalogueSchema = z.strictObject({
  _id: z.string().regex(/^synthetic-[a-z0-9-]{1,80}$/),
  synthetic: z.literal(true),
  published: z.boolean(),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(6000),
  patterns: z.array(patternSchema).max(4),
  item: z.string().min(1).max(100),
  dataset: z.enum(["synthetic-incidents-v1", "synthetic-incidents-v2", "synthetic-incidents-v3"]).optional(),
  harmCategories: harmCategoriesSchema.optional(),
  // Fictional scenario answer key, never an inferred finding about a real person.
  fictionalActor: z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]{1,79}$/), name: z.string().min(1).max(100), basis: z.literal("authored_fixture_truth") }).optional(),
  reporter: z.strictObject({ name: z.string().min(1).max(80), city: z.string().min(1).max(100), occupation: z.string().min(1).max(100) }).optional(),
  story: z.string().min(1).max(6000).optional(),
  sourceReportId: z.uuid().optional(),
  identifiers: z.array(z.strictObject({ kind: identifierKindSchema, value: z.string().min(1).max(254), polarity: z.enum(["affirmed", "contradicted", "uncertain"]), source: contactSourceSchema })).max(20).optional(),
  resolution: caseResolutionSchema.optional(),
  evidence: z.array(caseEvidenceSchema).max(20).optional(),
  media: z.array(caseMediaSchema).max(3).optional(),
  entitlementFence: z.number().int().nonnegative().optional(),
});
export type CatalogueCase = z.infer<typeof catalogueSchema>;
export function catalogueVersion(entry: CatalogueCase) {
  const parsed = catalogueSchema.parse(entry);
  const { entitlementFence, ...content } = parsed;
  void entitlementFence;
  // Internal transaction fencing must not change the published content version.
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...content,
        patterns: [...new Set(content.patterns)].sort(),
      }),
    )
    .digest("hex");
}
export async function receiptIsCurrent(
  database: Db,
  receipt: ConnectionReceipt,
  session?: ClientSession,
) {
  const entries = await database
    .collection<CatalogueCase>("catalogue")
    .find(
      {
        _id: { $in: receipt.cases.map((entry) => entry.id) },
        synthetic: true,
        published: true,
      },
      { session },
    )
    .toArray();
  return receipt.cases.every((reference) => {
    const entry = entries.find((entry) => entry._id === reference.id);
    return (
      entry &&
      catalogueSchema.safeParse(entry).success &&
      catalogueVersion(entry) === reference.version
    );
  });
}
