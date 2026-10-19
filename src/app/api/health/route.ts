import { response } from "@/server/http";
import { getDatabase } from "@/server/database/mongo";
import { getGraphClient } from "@/server/database/graph";
import { BackendConfigurationError, getServerConfig } from "@/server/config";

export const runtime = "nodejs";
async function checkDatabase(probe: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.resolve().then(probe), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("readiness_timeout")), 4000);
    })]);
    return "ready";
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); }
}
export async function GET() {
  let configuration: ReturnType<typeof getServerConfig>;
  try {
    configuration = getServerConfig();
  } catch (error) {
    const fields = error instanceof BackendConfigurationError ? error.fields : [];
    console.error("Readiness failed: invalid backend configuration", fields.join(", "));
    return response({ status: "unavailable", mode: "synthetic_demo", checks: { configuration: "invalid" },
      error: { code: "backend_configuration_invalid", fields } }, 503);
  }
  const [mongo, graph] = await Promise.all([
    checkDatabase(() => getDatabase().command({ ping: 1 })),
    checkDatabase(() => getGraphClient().then(client => client.list())),
  ]);
  const ready = mongo === "ready" && graph === "ready";
  if (!ready) console.error("Readiness failed: database unavailable", [mongo !== "ready" ? "mongo" : "", graph !== "ready" ? "graph" : ""].filter(Boolean).join(", "));
  return response({ status: ready ? "ready" : "unavailable", mode: configuration.deploymentMode === "hosted-demo" ? "synthetic_hosted" : "synthetic_localhost",
    checks: { configuration: "ready", mongo, graph } }, ready ? 200 : 503);
}
