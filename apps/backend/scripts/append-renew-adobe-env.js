/* Nối block Renew Adobe vào backend/.env hoặc xoay RENEW_ADOBE_INTERNAL_KEY (--rotate). */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const envPath = path.join(__dirname, "..", ".env");
const body = fs.readFileSync(envPath, "utf8");
const rotate = process.argv.includes("--rotate");

if (rotate && /RENEW_ADOBE_INTERNAL_KEY=/.test(body)) {
  const k = crypto.randomBytes(32).toString("hex");
  const next = body.replace(
    /^RENEW_ADOBE_INTERNAL_KEY=.*$/m,
    `RENEW_ADOBE_INTERNAL_KEY=${k}`
  );
  fs.writeFileSync(envPath, next, "utf8");
  process.stdout.write("RENEW_ADOBE_INTERNAL_KEY rotated in backend/.env\n");
  process.exit(0);
}

if (!rotate && /RENEW_ADOBE_INTERNAL_KEY=/.test(body)) {
  process.stdout.write(
    "backend/.env already has RENEW_ADOBE_INTERNAL_KEY — nothing to do. Use --rotate to replace.\n"
  );
  process.exit(0);
}
const k = crypto.randomBytes(32).toString("hex");
const block = `
# --- Renew Adobe API (tách process) — xem docs/renew-adobe-service.md
RENEW_ADOBE_INTERNAL_KEY=${k}
# Bật dòng dưới và chạy: npm run dev:renew-adobe (terminal 2). Comment = in-process.
# RENEW_ADOBE_API_BASE_URL=http://127.0.0.1:4002
RENEW_ADOBE_API_PORT=4002
`;
fs.appendFileSync(envPath, block);
process.stdout.write(
  "Appended Renew Adobe block to backend/.env (RENEW_ADOBE_INTERNAL_KEY generated).\n"
);
