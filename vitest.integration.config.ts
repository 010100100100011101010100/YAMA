import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/backend/server-only.ts", import.meta.url)),
  } },
  // Tests use disposable local graphs and fixture models; live providers require a deliberate test override.
  test: { environment: "node", env: { YAMA_GRAPH_TARGET: "local", YAMA_SEMANTIC_RETRIEVAL_ENABLED: "false", YAMA_TEXT_PROVIDER: "fixture", YAMA_PUBLIC_WEB_PROVIDER: "fixture", YAMA_PUBLIC_WEB_LIVE_ENABLED: "false" }, include: ["tests/integration/**/*.test.ts"], testTimeout: 20_000, hookTimeout: 30_000, fileParallelism: false },
});
