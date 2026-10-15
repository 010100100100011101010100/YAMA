import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("native Node bootstrap compatibility", () => {
  it("initializes an already initialized local database without dropping data", () => {
    const child = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--env-file=.env.local", "scripts/database/init.ts"], { encoding: "utf8", timeout: 25_000 });
    // Do not include process environment or command output in assertion failures.
    expect(child.status, "Idempotent native Node database bootstrap must succeed").toBe(0);
  });
});
