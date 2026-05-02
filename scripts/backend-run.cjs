/**
 * Run an npm script inside Automation/apps/backend with BACKEND_ENV_FILE applied.
 * Usage: node backend-run.cjs migrate
 */
const { spawn } = require("child_process");
const {
  backendRoot,
  stackEnvFile,
  requireStackEnvExists,
} = require("./paths.cjs");

const script = process.argv[2];
if (!script) {
  console.error("Usage: node backend-run.cjs <npm-script>\nExample: node backend-run.cjs migrate");
  process.exit(1);
}

requireStackEnvExists();

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const child = spawn(npmCmd, ["run", script], {
  cwd: backendRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    BACKEND_ENV_FILE: stackEnvFile,
  },
  shell: isWin,
});

child.on("exit", (code) => process.exit(code ?? 0));
