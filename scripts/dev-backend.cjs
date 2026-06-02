const { spawn, spawnSync } = require("child_process");
const path = require("path");
const { backendRoot, automationRoot } = require("./paths.cjs");

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const waitSec = process.env.DEV_DB_WAIT_SEC ?? "90";

const check = spawnSync(
  process.execPath,
  [path.join(automationRoot, "scripts/check-db.cjs"), `--wait=${waitSec}`],
  {
    stdio: "inherit",
    cwd: automationRoot,
    env: process.env,
  }
);

if (check.status !== 0) {
  process.exit(check.status ?? 1);
}

const child = spawn(
  npmCmd,
  ["run", "dev"],
  {
    cwd: backendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
    },
    shell: isWin,
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
