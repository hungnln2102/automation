require("dotenv").config({
  path: require("path").join(__dirname, "..", "..", ".env"),
});

const mailBackupIdArg = process.argv[2] || process.env.MAIL_BACKUP_ID;
const mailBackupId = mailBackupIdArg != null ? parseInt(mailBackupIdArg, 10) : null;

async function main() {
  console.log("=== Test đọc mail (chỉ dùng bảng mail_backup) ===\n");

  if (!Number.isFinite(mailBackupId) || mailBackupId < 1) {
    console.error("Cần truyền mail_backup_id.");
    process.exit(1);
  }

  const mailOtpService = require("../../src/services/mailOtpService");
  const backup = await mailOtpService.getMailBackupById(mailBackupId);
  if (!backup) {
    console.error("Không tìm thấy mail_backup id =", mailBackupId);
    process.exit(1);
  }

  const code = await mailOtpService.fetchOtpFromEmail(mailBackupId, {
    useEnvFallback: false,
    senderFilter: "adobe",
    debugToConsole: true,
  });
  if (code) console.log("Mã OTP (từ mail Adobe):", code);
  else console.log("Không tìm thấy mã OTP trong mail Adobe gần đây.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
