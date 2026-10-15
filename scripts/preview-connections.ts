// Isolated, disposable browser fixture. The user's application database is never selected.
// Run after npm run build; stop with Ctrl+C to remove only this preview's data/graphs.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { initializeSchema } from "../src/server/database/schema";
import { getServerConfig } from "../src/server/config";
import { connectGraph } from "../src/server/database/graph-client";
import { GraphStore, syntheticCatalogue } from "../src/server/database/graph";

const config = getServerConfig(), namespace = `yama_connection_preview_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const mongo = new MongoClient("mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true", {
  auth: { username: "yama_root", password: process.env.MONGO_ROOT_PASSWORD! }, authSource: "admin" });
const children: ChildProcess[] = [];
const environment = { ...process.env, APP_ORIGIN: "http://localhost:4100", MONGODB_DATABASE: namespace,
  MONGODB_URI: `mongodb://yama_root:${encodeURIComponent(process.env.MONGO_ROOT_PASSWORD!)}@127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true&authSource=admin`,
  YAMA_TEXT_PROVIDER: "fixture", YAMA_MODEL_LIVE_ENABLED: "false", YAMA_LANGFUSE_ENABLED: "false", YAMA_VOICE_LIVE_ENABLED: "false" };
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(children.map(child => new Promise<void>(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  })));
  try {
    const graph = await connectGraph(config.graphHost, config.graphPort, config.graphPassword);
    try { for (const name of await graph.list()) if (name.startsWith(`${namespace}_`)) await graph.selectGraph(name).delete(); }
    finally { await graph.close(); }
    await mongo.db(namespace).dropDatabase();
  } finally { await mongo.close(); }
}
process.on("SIGTERM", () => { void stop(); }); process.on("SIGINT", () => { void stop(); });
function launch(arguments_: string[]) {
  const child = spawn(process.execPath, arguments_, { env: environment, stdio: "ignore" }); children.push(child);
  child.once("error", () => { console.error("Preview process failed; no provider calls are enabled."); void stop(); });
  child.once("exit", () => { if (!stopping) { console.error("Preview process exited; stopping isolated preview."); void stop(); } });
}
try {
  await initializeSchema(mongo.db(namespace));
  for (const entry of syntheticCatalogue) await mongo.db(namespace).collection<{ _id: string }>("catalogue").insertOne(entry);
  const graph = await connectGraph(config.graphHost, config.graphPort, config.graphPassword);
  try { await new GraphStore(graph, namespace).seedCatalogue(syntheticCatalogue); } finally { await graph.close(); }
  launch(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4100"]);
  for (const worker of ["graph", "agent"]) launch(["--conditions=react-server", "--import", "tsx", `scripts/database/${worker}-worker.ts`]);
  console.log("Isolated synthetic preview: http://localhost:4100 — fixtures only. Stop to clean up its private test namespace.");
} catch { console.error("Isolated preview setup failed; credentials are not printed."); await stop(); process.exitCode = 1; }
