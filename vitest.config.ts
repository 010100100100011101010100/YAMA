import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // One browser-test worker leaves room for Next.js and the local databases on 8 GB laptops.
  test: { environment: "jsdom", maxWorkers: 1, setupFiles: ["./tests/frontend/setup.ts"], include: ["tests/frontend/**/*.test.{ts,tsx}"] },
});
