require("dotenv").config();
const { ImapFlow } = require("imapflow");

const MAILTEST = process.env.MAILTEST || process.env.ADOBE_OTP_IMAP_USER;
const APP_PASSWORD =
  process.env.APPPASSWORD ||
  process.env["2FA"] ||
  process.env.ADOBE_OTP_IMAP_PASSWORD;

async function main() {
  if (!MAILTEST || !APP_PASSWORD) {
    console.error("Cần set MAILTEST và APPPASSWORD trong .env");
    process.exit(1);
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: MAILTEST, pass: APP_PASSWORD },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const info = await client.status("INBOX", { messages: true });
      console.log("INBOX messages:", info.messages ?? "—");
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
