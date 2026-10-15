import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const docker = existsSync(resolve(".local/runtime/bin/docker")) ? resolve(".local/runtime/bin/docker") : "docker";
mkdirSync(".local/runtime", { recursive: true });
const idFile = resolve(".local/runtime/evidence-image-id");
execFileSync(docker, ["--context", "colima-yama", "build", "--iidfile", idFile, "--tag", "yama-evidence:local", "infra/evidence"], { stdio: "inherit" });
const image = readFileSync(idFile, "utf8").trim();
if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Invalid parser image ID");
writeFileSync(".local/evidence-runtime.json", JSON.stringify({ image }), { mode: 0o600 });
console.log("Local document parser built. Extraction uses this immutable image ID with no network access.");
