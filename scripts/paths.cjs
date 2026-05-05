/**
 * Paths for the standalone Automation workspace.
 */
const path = require("path");

const automationRoot = path.join(__dirname, "..");
const appsRoot = path.join(automationRoot, "apps");
const backendRoot = path.join(appsRoot, "backend");
const frontendRoot = path.join(appsRoot, "frontend");
/** Docker deploy / production stack — docker-compose.deploy.yml env_file */
const backendDockerEnvFile = path.join(backendRoot, ".env.docker");

module.exports = {
  automationRoot,
  appsRoot,
  backendRoot,
  frontendRoot,
  backendDockerEnvFile,
};
