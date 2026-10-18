import { writeFile, readFile } from "node:fs/promises";
import { z } from "zod";
import { getDatabase, getMongoClient } from "../../src/server/database/mongo";
import { getGraphClient } from "../../src/server/database/graph";
import { runSdkScript } from "../../src/server/database/graphrag";
import { catalogueVersion, type CatalogueCase } from "../../src/server/reports/catalogue-policy";
import { catalogueSemanticText, SEMANTIC_REVISION, semanticHash } from "../../src/server/reports/semantic";

const client = await getGraphClient();
try {
  const database = getDatabase(), graph = client.selectGraph(`${database.databaseName}_catalogue`);
  const entries = await database.collection<CatalogueCase>("catalogue").find({ synthetic: true, published: true }).limit(101).toArray();
  if (!entries.length || entries.length > 100) throw new Error("semantic_index_limit");
  const documents = entries.map(entry => ({ id: entry._id, text: catalogueSemanticText(entry) }));
  const output = JSON.parse(await runSdkScript("scripts.semantic_embeddings", { documents }, true));
  const parsed = z.strictObject({ documents: z.array(z.strictObject({ id: z.string(), hash: z.string(), vector: z.array(z.number().finite()).length(384) })).length(entries.length) }).parse(output);
  if (new Set(parsed.documents.map(document => document.id)).size !== entries.length) throw new Error("semantic_index_invalid");
  const indexes = await graph.roQuery<{ label: string; properties: string[] }>("CALL db.indexes() YIELD label,properties RETURN label,properties");
  if (!indexes.data?.some(index => index.label === "PublishedSemanticCase" && index.properties.includes("embedding"))) {
    await graph.query("CREATE VECTOR INDEX FOR (c:PublishedSemanticCase) ON (c.embedding) OPTIONS {dimension:384, similarityFunction:'cosine', M:16, efConstruction:100}");
  }
  for (const document of parsed.documents) {
    const entry = entries.find(entry => entry._id === document.id), source = documents.find(source => source.id === document.id);
    if (!entry || !source || document.hash !== semanticHash(source.text)) throw new Error("semantic_index_invalid");
    const updated = await graph.query<{ count: number }>(`MATCH (c:CatalogueCase {id:$id}) WHERE c.published=true AND c.synthetic=true AND c.contentVersion=$version
      SET c:PublishedSemanticCase, c.embedding=vecf32($vector), c.semanticVersion=$version, c.semanticHash=$hash, c.semanticModel=$model RETURN count(c) AS count`, {
      params: { id: entry._id, version: catalogueVersion(entry), vector: document.vector, hash: document.hash, model: SEMANTIC_REVISION }, TIMEOUT: 3000,
    });
    if (updated.data?.[0]?.count !== 1) throw new Error("catalogue_changed");
  }
  const path = ".env.local", contents = await readFile(path, "utf8");
  const key = "YAMA_SEMANTIC_RETRIEVAL_ENABLED", value = `${key}=true`;
  await writeFile(path, (new RegExp(`^${key}=.*$`, "m").test(contents) ? contents.replace(new RegExp(`^${key}=.*$`, "m"), value) : `${contents.trimEnd()}\n${value}\n`), { mode: 0o600 });
  console.log(`Indexed ${entries.length} published privacy-filtered accounts with the pinned local embedding model. Restart application workers.`);
} catch {
  console.error("Semantic indexing failed; no credentials or case text were logged."); process.exitCode = 1;
} finally { await client.close(); await getMongoClient().close(); }
