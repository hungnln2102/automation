const { spawn } = require("child_process");
const { frontendRoot } = require("./paths.cjs");

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

/** Backend stack Automation chạy :6000 — proxy /api trùng target này */
const child = spawn(
  npmCmd,
  ["exec", "vite", "--", "--port", "6001", "--strictPort"],
  {
    cwd: frontendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_API_PROXY_TARGET: "http://127.0.0.1:6000",
    },
    shell: isWin,
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
