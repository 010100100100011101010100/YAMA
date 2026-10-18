import "server-only";
import { spawn } from "node:child_process";
import { z } from "zod";
import { getServerConfig } from "@/server/config";
import { ServiceError } from "@/server/errors";
import { SEMANTIC_MODEL, SEMANTIC_REVISION } from "@/server/reports/semantic";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const matchSchema = z.strictObject({ id: z.string().min(1).max(100), version: hash, sharedPatterns: z.array(z.string()).max(4), sharedIdentifiers: z.array(z.string()).max(100), sharedDetails: z.array(z.string()).max(50),
  semantic: z.strictObject({ score: z.number().min(0.78).max(1.00001), model: z.literal(SEMANTIC_MODEL), revision: z.literal(SEMANTIC_REVISION), documentHash: hash, queryHash: hash }).optional() });
export async function runSdkScript(module: "scripts.graphrag_snapshot" | "scripts.semantic_embeddings", input: unknown, indexing = false) {
  const config = getServerConfig();
  // Python is provisioned separately from the Next bundle by setup-graphrag.sh.
  const python = process.env.YAMA_GRAPHRAG_PYTHON;
  if (!python) throw new ServiceError(503, "graphrag_unavailable");
  return new Promise<string>((resolve, reject) => {
    const child = spawn(python, ["-m", module], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], env: {
      PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONUTF8: "1",
      ...(indexing ? {} : { YAMA_SDK_GRAPH_HOST: config.graphHost, YAMA_SDK_GRAPH_PORT: String(config.graphPort), YAMA_SDK_GRAPH_USERNAME: config.graphUsername,
      YAMA_SDK_GRAPH_PASSWORD: config.graphPassword, YAMA_SDK_GRAPH_TLS: String(config.graphTls) }),
      YAMA_SEMANTIC_MODEL_PATH: process.env.YAMA_SEMANTIC_MODEL_PATH, HF_HUB_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1", TOKENIZERS_PARALLELISM: "false",
    } });
    let text = "", bytes = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), indexing ? 240_000 : 30_000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { bytes += Buffer.byteLength(chunk); if (bytes > 2 * 1024 * 1024) child.kill("SIGKILL"); else text += chunk; });
    child.stderr.on("data", () => undefined);
    child.stdin.on("error", () => undefined);
    child.once("error", () => { clearTimeout(timer); reject(new ServiceError(503, "graphrag_unavailable")); });
    child.once("close", code => { clearTimeout(timer); if (code === 0) resolve(text); else reject(new ServiceError(503, "graphrag_unavailable")); });
    child.stdin.end(JSON.stringify(input));
  });
}
export async function retrieveCatalogue(namespace: string, seeds: { patterns: string[]; identifiers: string[]; details: string[] }, semanticQuery = "") {
  const output = await runSdkScript("scripts.graphrag_snapshot", { namespace, seeds, ...(semanticQuery && process.env.YAMA_SEMANTIC_RETRIEVAL_ENABLED === "true" ? { semanticQuery } : {}) });
  try {
    const parsed = z.strictObject({ matches: z.array(matchSchema).max(10), sdkVersion: z.literal("1.4.0"), truncated: z.boolean() }).parse(JSON.parse(output));
    return parsed.matches;
  } catch { throw new ServiceError(503, "graphrag_unavailable"); }
}
