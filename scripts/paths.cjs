/**
 * Paths for the standalone Automation workspace.
 */
const path = require("path");
const fs = require("fs");

const automationRoot = path.join(__dirname, "..");
const appsRoot = path.join(automationRoot, "apps");
const backendRoot = path.join(appsRoot, "backend");
const frontendRoot = path.join(appsRoot, "frontend");
const stackEnvFile = path.join(automationRoot, "env", "stack.backend.env");

function requireStackEnvExists() {
  if (!fs.existsSync(stackEnvFile)) {
    console.error(
      "[Automation] Missing env file: " + stackEnvFile + "\n" +
        "  -> Copy env/stack.backend.env.example to env/stack.backend.env and adjust it if needed."
    );
    process.exit(1);
  }
}

module.exports = {
  automationRoot,
  appsRoot,
  backendRoot,
  frontendRoot,
  stackEnvFile,
  requireStackEnvExists,
};
