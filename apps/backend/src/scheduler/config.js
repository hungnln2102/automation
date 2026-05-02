const { loadBackendEnv } = require("../config/loadEnv");

loadBackendEnv();

const { pool } = require("../config/database");

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const schedulerTimezone =
  typeof process.env.APP_TIMEZONE === "string" &&
  /^[A-Za-z0-9_\/+\-]+$/.test(process.env.APP_TIMEZONE)
    ? process.env.APP_TIMEZONE
    : DEFAULT_TIMEZONE;

const cronExpression = process.env.CRON_SCHEDULE || "1 0 * * *";
const runOnStart = process.env.RUN_CRON_ON_START === "true";
const enableDbBackup = process.env.ENABLE_DB_BACKUP === "true";

function getSqlCurrentDate() {
  if (process.env.MOCK_DATE) {
    return `'${process.env.MOCK_DATE}'::date`;
  }
  return "(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date";
}

module.exports = {
  pool,
  schedulerTimezone,
  cronExpression,
  runOnStart,
  enableDbBackup,
  getSqlCurrentDate,
};
