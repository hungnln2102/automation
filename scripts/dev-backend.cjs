const { spawn } = require("child_process");
const {
  backendRoot,
  stackEnvFile,
  requireStackEnvExists,
} = require("./paths.cjs");

requireStackEnvExists();

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const child = spawn(
  npmCmd,
  ["run", "dev"],
  {
    cwd: backendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      BACKEND_ENV_FILE: stackEnvFile,
    },
    shell: isWin,
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
