require("dotenv").config({
  path: require("path").join(__dirname, "..", "..", ".env"),
});

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const listOnly = process.argv.includes("--list") || process.argv.includes("-l");
const debugOnly = process.argv.includes("--debug") || process.argv.includes("-d");
const countOnly = process.argv.includes("--count") || process.argv.includes("-c");
const mailBackupIdArg = args[0] || process.env.MAIL_BACKUP_ID;
const mailBackupId = mailBackupIdArg != null ? parseInt(mailBackupIdArg, 10) : null;
const minutesArg = args[1];
const minutesBack = minutesArg != null ? parseInt(minutesArg, 10) : 60;

async function main() {
  if (!Number.isFinite(mailBackupId) || mailBackupId < 1) {
    console.error("Cần truyền mail_backup_id.");
    process.exit(1);
  }

  const mailOtpService = require("../../src/services/mailOtpService");

  if (countOnly) {
    const count = await mailOtpService.getInboxCount(mailBackupId);
    console.log("INBOX — số thư:", count);
    return;
  }

  if (debugOnly) {
    const debug = await mailOtpService.getConnectionDebug(mailBackupId);
    console.log(debug);
    return;
  }

  if (listOnly) {
    const list = await mailOtpService.listRecentEmails(mailBackupId, {
      minutesBack,
      limit: 25,
    });
    console.log(list);
    return;
  }

  const raw = await mailOtpService.fetchLastAdobeEmailRaw(mailBackupId, { minutesBack });
  if (!raw) {
    console.log("Không tìm thấy mail Adobe.");
    process.exit(1);
  }

  const outDir = path.join(__dirname, "..", "..");
  fs.writeFileSync(path.join(outDir, "last-adobe-mail.html"), raw.html || "", "utf8");
  fs.writeFileSync(path.join(outDir, "last-adobe-mail.txt"), raw.text || "", "utf8");
  console.log("Đã ghi file mail raw.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
