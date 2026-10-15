import "server-only";
import { createHash } from "node:crypto";
import type { Db, ClientSession } from "mongodb";
import { z } from "zod";
import { patternSchema, type ConnectionReceipt } from "@/lib/connections";

export const catalogueSchema = z.strictObject({
  _id: z.string().regex(/^synthetic-[a-z0-9-]{1,80}$/),
  synthetic: z.literal(true),
  published: z.boolean(),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(6000),
  patterns: z.array(patternSchema).max(4),
  item: z.string().min(1).max(100),
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
