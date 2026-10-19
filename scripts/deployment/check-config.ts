import { BackendConfigurationError, getServerConfig } from "../../src/server/config";

try {
  const configuration = getServerConfig();
  if (configuration.deploymentMode !== "hosted-demo") throw new BackendConfigurationError(["YAMA_DEPLOYMENT_MODE"]);
  console.log("Hosted demo configuration valid. Database readiness is checked at /api/health.");
} catch (error) {
  const fields = error instanceof BackendConfigurationError ? error.fields.join(", ") : "backend configuration";
  console.error(`Container startup blocked. Check Render environment variables: ${fields}`);
  process.exitCode = 1;
}
