/**
 * Run an npm script inside Automation/apps/backend — nạp env qua apps/backend/src/config/loadEnv.js
 * (.env rồi .env.local khi dev; production-like thì .env + .env.docker).
 * Usage: node backend-run.cjs migrate
 */
const { spawn } = require("child_process");
const { backendRoot } = require("./paths.cjs");

const script = process.argv[2];
if (!script) {
  console.error("Usage: node backend-run.cjs <npm-script>\nExample: node backend-run.cjs migrate");
  process.exit(1);
}

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const child = spawn(npmCmd, ["run", script], {
  cwd: backendRoot,
  stdio: "inherit",
  env: {
    ...process.env,
  },
  shell: isWin,
});

child.on("exit", (code) => process.exit(code ?? 0));
