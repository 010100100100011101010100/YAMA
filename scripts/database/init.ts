import { MongoClient } from "mongodb";
import { getServerConfig } from "../../src/server/config";
import { initializeSchema } from "../../src/server/database/schema";
import { GraphStore, getGraphClient, syntheticCatalogue } from "../../src/server/database/graph";
import type { CatalogueCase } from "../../src/server/database/graph";

const config = getServerConfig();
if (!process.env.MONGO_ROOT_PASSWORD || !process.env.MONGO_APP_PASSWORD) throw new Error("Local MongoDB bootstrap secrets are missing.");
const root = new MongoClient("mongodb://127.0.0.1:27018/?directConnection=true", {
  auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD }, authSource: "admin", serverSelectionTimeoutMS: 5000,
});
let app: MongoClient | undefined;
let stage = "root connection";
try {
  await root.connect();
  stage = "replica set initialization";
  try { await root.db("admin").command({ replSetInitiate: { _id: "yama-rs", members: [{ _id: 0, host: "mongo:27018" }] } }); }
  catch (error) { if ((error as { code?: number }).code !== 23) throw error; }
  stage = "primary election";
  let primary = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await root.db("admin").command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!primary) throw new Error("Replica set did not elect its local primary.");
  stage = "application user";
  const users = await root.db(config.mongoDatabase).command({ usersInfo: "yama" });
  if (!users.users.length) await root.db(config.mongoDatabase).command({ createUser: "yama", pwd: process.env.MONGO_APP_PASSWORD, roles: [{ role: "readWrite", db: config.mongoDatabase }] });
  // Schema/bootstrap needs owner privileges; the running application only has readWrite.
  stage = "schema and indexes";
  await initializeSchema(root.db(config.mongoDatabase));
  app = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  stage = "application connection";
  await app.connect();
  stage = "MongoDB catalogue";
  for (const entry of syntheticCatalogue) await app.db(config.mongoDatabase).collection<CatalogueCase>("catalogue").replaceOne({ _id: entry._id }, entry, { upsert: true });
  stage = "graph catalogue";
  const graph = await getGraphClient();
  try { await new GraphStore(graph, config.mongoDatabase).seedCatalogue(syntheticCatalogue); }
  finally { await graph.close(); }
  console.log("Initialized local replica set, application user, schemas, indexes, and synthetic graph catalogue.");
} catch {
  console.error(`Database initialization failed at ${stage}. Check db:status and local container logs; credentials are not printed.`);
  process.exitCode = 1;
} finally { await app?.close(); await root.close(); }
