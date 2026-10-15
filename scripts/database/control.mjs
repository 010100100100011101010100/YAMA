import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const binary = name => existsSync(resolve(`.local/runtime/bin/${name}`)) ? resolve(`.local/runtime/bin/${name}`) : name;
const environment = { ...process.env, PATH: `${resolve(".local/runtime/bin")}:${process.env.PATH}` };
const action = process.argv[2];
const run = (command, args) => {
  const child = spawnSync(binary(command), args, { stdio: "inherit", env: environment });
  if (child.error || child.status !== 0) process.exit(child.status || 1);
};
if (action === "up") {
  run("colima", ["start", "yama", "--cpus", "2", "--memory", "2", "--disk", "12", "--root-disk", "12", "--vm-type", "vz", "--activate=false", "--ssh-config=false", "--mount", `${process.cwd()}:w`]);
  run("docker-compose", ["--context", "colima-yama", "--env-file", ".env.local", "-f", "compose.yaml", "up", "-d", "--wait"]);
} else if (action === "down" || action === "status") {
  // Down preserves named volumes. No command here drops data or stops the unrelated Redis service.
  run("docker-compose", ["--context", "colima-yama", "--env-file", ".env.local", "-f", "compose.yaml", action === "down" ? "down" : "ps"]);
} else { console.error("Use up, down, or status."); process.exit(1); }
