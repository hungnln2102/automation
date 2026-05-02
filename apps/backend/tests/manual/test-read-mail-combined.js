require("dotenv").config({
  path: require("path").join(__dirname, "..", "..", ".env"),
});

const fs = require("fs");
const path = require("path");

const mailBackupIdArg = process.argv[2] || process.env.MAIL_BACKUP_ID;
const mailBackupId = mailBackupIdArg != null ? parseInt(mailBackupIdArg, 10) : null;
const limit = 25;

async function main() {
  const user = process.env.MAILTEST || process.env.ADOBE_OTP_IMAP_USER;
  const pass =
    process.env.APPPASSWORD ||
    process.env["2FA"] ||
    process.env.ADOBE_OTP_IMAP_PASSWORD;
  if (!user || !pass) {
    console.error("Cần set MAILTEST và APPPASSWORD trong .env");
    process.exit(1);
  }

  const mailOtpService = require("../../src/services/mailOtpService");
  const { emails, newest } = await mailOtpService.fetchRecentWithEnvLogin({
    mailBackupIdForFilter: Number.isFinite(mailBackupId) ? mailBackupId : null,
    limit,
  });

  if (newest && /adobe|message@adobe/i.test(newest.from || "") && newest.html) {
    const outPath = path.join(__dirname, "..", "..", "last-adobe-mail.html");
    fs.writeFileSync(outPath, newest.html, "utf8");
    console.log("Đã ghi HTML ra:", outPath);
  }

  console.log("Số thư lấy được:", emails.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
