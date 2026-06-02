/**
 * Thêm 1 dòng mail_backup từ biến môi trường MAIL_BACKUP_LINE (không commit secret).
 *   email|account_password|app_password
 *
 *   set MAIL_BACKUP_LINE=email|pass|app pass
 *   node scripts/seed-mail-backup-line.cjs
 */
const path = require("path");
const { backendRoot } = require("./paths.cjs");

process.chdir(backendRoot);
require(path.join(backendRoot, "src/config/loadEnv")).loadBackendEnv();

const { createMailBackup, parseMailBackupLine } = require(path.join(
  backendRoot,
  "src/services/mailBackupService"
));

async function main() {
  const line = process.env.MAIL_BACKUP_LINE || process.argv[2];
  if (!line || !parseMailBackupLine(line)) {
    console.error("Cần MAIL_BACKUP_LINE hoặc argv: email|account_password|app_password");
    process.exit(1);
  }
  const row = await createMailBackup({
    raw_line: line,
    is_default: true,
    note: process.env.MAIL_BACKUP_NOTE || "seed",
  });
  console.log("[seed-mail-backup] OK id=%s email=%s", row.id, row.email);
}

main().catch((err) => {
  console.error("[seed-mail-backup] FAIL:", err.message);
  process.exit(1);
});
