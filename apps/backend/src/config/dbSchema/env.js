const { loadBackendEnv } = require("../loadEnv");

loadBackendEnv();

const pickSchema = (...candidates) => candidates.find(Boolean);

const SCHEMA_ADMIN = pickSchema(
  process.env.DB_SCHEMA_ADMIN,
  process.env.SCHEMA_ADMIN,
  "admin"
);

const SCHEMA_RENEW_ADOBE = pickSchema(
  process.env.DB_SCHEMA_SYSTEM_AUTOMATION,
  process.env.SCHEMA_SYSTEM_AUTOMATION,
  process.env.DB_SCHEMA_RENEW_ADOBE,
  process.env.SCHEMA_RENEW_ADOBE,
  "system_automation"
);

const SCHEMA_MAIL_BACKUP = pickSchema(
  process.env.DB_SCHEMA_MAIL_BACKUP,
  SCHEMA_RENEW_ADOBE
);

const NOTIFICATION_GROUP_ID = process.env.TELEGRAM_CHAT_ID || "";
const RENEWAL_TOPIC_ID = Number(process.env.RENEWAL_TOPIC_ID) || 0;

module.exports = {
  pickSchema,
  SCHEMA_ADMIN,
  SCHEMA_MAIL_BACKUP,
  SCHEMA_RENEW_ADOBE,
  NOTIFICATION_GROUP_ID,
  RENEWAL_TOPIC_ID,
};
