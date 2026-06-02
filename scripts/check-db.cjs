const path = require("path");
const { backendRoot, automationRoot } = require("./paths.cjs");

process.chdir(backendRoot);
require(path.join(backendRoot, "src/config/loadEnv")).loadBackendEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.PG_URL ||
  "";

const waitArg = process.argv.find((a) => a.startsWith("--wait="));
const waitSec = waitArg ? Math.max(0, Number(waitArg.split("=")[1]) || 0) : 0;

const VPS_HOST = (process.env.VPS_SSH_HOST || "161.248.146.6").trim();
const VPS_USER = (process.env.VPS_SSH_USER || "root").trim();
const TUNNEL_LOCAL_PORT = (process.env.VPS_DB_TUNNEL_PORT || "5432").trim();

function maskDatabaseUrl(url) {
  return String(url).replace(/:([^:@/]+)@/, ":***@");
}

function isLocalVpsTunnelUrl(url) {
  try {
    const u = new URL(String(url).replace(/^postgresql:/, "http:"));
    return (
      ["127.0.0.1", "localhost"].includes(u.hostname) &&
      (u.port || "5432") === TUNNEL_LOCAL_PORT
    );
  } catch {
    return false;
  }
}

function printHelp() {
  console.error("");
  console.error("[db:check] Không kết nối được PostgreSQL.");
  if (isLocalVpsTunnelUrl(DATABASE_URL)) {
    console.error("[db:check] DB trên VPS — cần SSH tunnel trước khi chạy dev:");
    console.error(
      `  ssh -L ${TUNNEL_LOCAL_PORT}:127.0.0.1:${TUNNEL_LOCAL_PORT} ${VPS_USER}@${VPS_HOST}`
    );
    console.error("  hoặc: npm run tunnel:vps");
    console.error("Giữ cửa sổ SSH mở, rồi chạy lại npm run dev.");
  } else {
    console.error("[db:check] Kiểm tra DATABASE_URL trong apps/backend/.env.local");
    console.error("  Docker local: npm run docker:up && npm run db:setup");
  }
  console.error("");
}

async function tryConnect() {
  const { Client } = require(path.join(backendRoot, "node_modules/pg"));
  const client = new Client({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  const result = await client.query("SELECT NOW() AS now");
  await client.end();
  return result.rows[0].now;
}

async function main() {
  if (!DATABASE_URL) {
    console.error("[db:check] Thiếu DATABASE_URL trong apps/backend/.env.local");
    console.error("  copy apps/backend/env.local.example apps/backend/.env.local");
    process.exit(1);
  }

  const deadline = Date.now() + waitSec * 1000;
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      const now = await tryConnect();
      console.log(`[db:check] OK — ${maskDatabaseUrl(DATABASE_URL)} — ${now}`);
      return;
    } catch (err) {
      const remaining = waitSec > 0 ? Math.max(0, deadline - Date.now()) : 0;
      if (remaining <= 0) {
        console.error(`[db:check] Lỗi (lần ${attempt}): ${err.message}`);
        printHelp();
        process.exit(1);
      }
      if (attempt === 1) {
        console.warn(`[db:check] Chờ PostgreSQL (tối đa ${waitSec}s)...`);
        if (isLocalVpsTunnelUrl(DATABASE_URL)) {
          console.warn(
            `[db:check] Mở tunnel: ssh -L ${TUNNEL_LOCAL_PORT}:127.0.0.1:${TUNNEL_LOCAL_PORT} ${VPS_USER}@${VPS_HOST}`
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

main().catch((err) => {
  console.error("[db:check] Unexpected error:", err.message);
  process.exit(1);
});
