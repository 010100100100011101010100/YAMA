import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { AGENT_ADAPTER, adapterSchema, extractionSchema, type AgentAdapter } from "@/lib/agent-task";
import { publicReport, type Report } from "@/server/reports/domain";
import { ServiceError } from "@/server/errors";
import { codexSettings } from "./config";

export type AgentRunner = (report: Report, signal: AbortSignal, adapter?: AgentAdapter) => Promise<unknown>;
const providerEnvironment = ["YAMA_DEMO_ONLY", "YAMA_TEXT_PROVIDER", "YAMA_MODEL_LIVE_ENABLED", "YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED", "OPENAI_API_KEY", "OPENAI_TEXT_MODEL", "OPENAI_BASE_URL", "YAMA_OPENAI_MAX_OUTPUT_TOKENS", "YAMA_OPENAI_TIMEOUT_SECONDS", "YAMA_LANGFUSE_ENABLED", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"];
const codexEnvironment = ["HOME", "CODEX_HOME", "YAMA_DEMO_ONLY", "YAMA_TEXT_PROVIDER", "YAMA_CODEX_ENABLED", "YAMA_CODEX_BINARY", "YAMA_CODEX_TIMEOUT_SECONDS"];
export function snapshotEnvironment(adapter: AgentAdapter) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" };
  if (adapter.provider === "openai") for (const key of providerEnvironment) if (process.env[key] !== undefined) env[key] = process.env[key];
  if (adapter.provider === "codex") for (const key of codexEnvironment) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}
export const runFixtureSnapshot: AgentRunner = (report, signal) => runAgentSnapshot(report, signal, AGENT_ADAPTER);
export const runAgentSnapshot: AgentRunner = async (report, signal, selected = AGENT_ADAPTER) => {
  const adapter = adapterSchema.parse(selected);
  const output = await runPrivateSnapshot("scripts.agent_snapshot", { report: publicReport(report), adapter }, signal, adapter);
  const envelope = z.object({ receipt: z.object({ status: z.string(), errorCode: z.string().nullable(), adapter: adapterSchema }), preview: extractionSchema.nullable() });
  const parsed = envelope.safeParse(output);
  if (!parsed.success) throw new ServiceError(503, "invalid_model_output");
  if (JSON.stringify(parsed.data.receipt.adapter) !== JSON.stringify(adapter)) throw new ServiceError(503, "provider_config_changed");
  if (parsed.data.receipt.status !== "ready" || !parsed.data.preview) {
    const code = parsed.data.receipt.errorCode;
    throw new ServiceError(503, code && ["context_limit", "tool_timeout", "model_refused", "model_incomplete", "model_mismatch", "model_unavailable", "invalid_model_output", "provider_not_configured"].includes(code) ? code : "extraction_failed");
  }
  return parsed.data.preview;
};

export async function runPrivateSnapshot(module: "scripts.agent_snapshot" | "scripts.dialogue_snapshot", bindings: unknown, signal: AbortSignal, adapter: AgentAdapter, onText?: (text: string) => Promise<void> | void): Promise<unknown> {
  if (adapter.live && process.env.NODE_ENV === "test") throw new ServiceError(503, "live_provider_disabled_in_tests");
  if (signal.aborted) throw new ServiceError(409, "task_canceled");
  const virtualPython = join(process.cwd(), ".venv/bin/python");
  const python = process.env.YAMA_AGENT_PYTHON || (adapter.live && existsSync(virtualPython) ? virtualPython : "python3");
  const timeout = adapter.provider === "codex" ? (codexSettings().timeoutSeconds + 10) * 1000 : 25_000;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, ["-m", module], {
      cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"],
      env: snapshotEnvironment(adapter),
      detached: adapter.provider === "codex" && process.platform !== "win32",
    });
    let text = "", lineBuffer = "", finalLine = "", bytes = 0, failure: ServiceError | null = null;
    let progress = Promise.resolve();
    const stop = (code: string) => {
      failure ??= new ServiceError(503, code);
      // Codex inherits this process group, so a canceled turn cannot leave inference running.
      if (adapter.provider === "codex" && process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      } else child.kill("SIGKILL");
    };
    const canceled = () => stop("task_canceled");
    signal.addEventListener("abort", canceled, { once: true });
    if (signal.aborted) canceled();
    const timer = setTimeout(() => stop("tool_timeout"), timeout);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 2 * 1024 * 1024) { stop("output_limit"); return; }
      if (!onText) { text += chunk; return; }
      lineBuffer += chunk;
      let end: number;
      while ((end = lineBuffer.indexOf("\n")) >= 0) {
        const line = lineBuffer.slice(0, end); lineBuffer = lineBuffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "text") {
            const checked = z.strictObject({ type: z.literal("text"), text: z.string().max(4000) }).parse(event);
            if (finalLine) throw new Error("progress_after_result");
            progress = progress.then(() => onText(checked.text)).catch(() => stop("invalid_model_output"));
          } else { if (finalLine) throw new Error("duplicate_result"); finalLine = line; }
        } catch { stop("invalid_model_output"); }
      }
    });
    // Drain diagnostics without preserving/logging private model or parser text.
    child.stderr.on("data", () => undefined);
    child.stdin.on("error", () => stop("extraction_failed"));
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", canceled); };
    child.once("error", () => { cleanup(); reject(new ServiceError(503, "agent_runtime_unavailable")); });
    child.once("close", code => { cleanup(); void progress.then(() => {
      if (failure || code !== 0) reject(failure ?? new ServiceError(503, "extraction_failed"));
      else if (onText && lineBuffer.trim()) reject(new ServiceError(503, "invalid_model_output"));
      else resolve(onText ? finalLine : text);
    }); });
    child.stdin.end(JSON.stringify(bindings));
  });
  try { return JSON.parse(output); } catch { throw new ServiceError(503, "invalid_model_output"); }
}
