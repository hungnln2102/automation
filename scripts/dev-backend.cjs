const { spawn } = require("child_process");
const { backendRoot } = require("./paths.cjs");

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
    },
    shell: isWin,
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
