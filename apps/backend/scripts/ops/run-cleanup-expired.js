/**
 * Chạy thủ công job cleanup expired Adobe users (giống cron 23:30).
 *
 * Usage: node scripts/run-cleanup-expired.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { createCleanupExpiredAdobeUsersTask } = require("../src/scheduler/tasks/cleanupExpiredAdobeUsers");

createCleanupExpiredAdobeUsersTask()("manual")
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
