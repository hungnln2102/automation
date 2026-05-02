const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");
const { db } = require("../../db");
const { TABLE, COLS } = require("../../controllers/RenewAdobeController/accountTable");
const {
  getProfilesRootDir,
  sanitizeEmailForPath,
} = require("../../services/renew-adobe/adobe-renew-v2/shared/profileSession");

function buildExpectedProfileKeysFromEmails(emails = []) {
  const keys = new Set();
  for (const email of emails) {
    const e = String(email || "").trim().toLowerCase();
    if (!e) continue;
    keys.add(sanitizeEmailForPath(e));
  }
  return keys;
}

function listProfileDirEntries(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function removeOrphanProfileDirs(rootDir, existingProfileKeys) {
  const profileKeysOnDisk = listProfileDirEntries(rootDir);
  const removed = [];

  for (const key of profileKeysOnDisk) {
    if (existingProfileKeys.has(key)) continue;
    const targetDir = path.join(rootDir, key);
    fs.rmSync(targetDir, { recursive: true, force: true });
    removed.push(targetDir);
  }

  return {
    scannedCount: profileKeysOnDisk.length,
    removedCount: removed.length,
    removedDirs: removed,
  };
}

function createCleanupAdobeProfileGarbageTask() {
  return async function cleanupAdobeProfileGarbageTask(trigger = "cron") {
    const rootDir = getProfilesRootDir();
    try {
      const rows = await db(TABLE).select(COLS.EMAIL);
      const emails = rows.map((r) => r[COLS.EMAIL]);
      const existingProfileKeys = buildExpectedProfileKeysFromEmails(emails);
      const result = removeOrphanProfileDirs(rootDir, existingProfileKeys);

      logger.info(
        "[scheduler] cleanupAdobeProfileGarbage done (%s): scanned=%d removed=%d root=%s",
        trigger,
        result.scannedCount,
        result.removedCount,
        rootDir
      );

      return {
        success: true,
        trigger,
        rootDir,
        ...result,
      };
    } catch (err) {
      logger.error(
        "[scheduler] cleanupAdobeProfileGarbage failed (%s): %s",
        trigger,
        err.message
      );
      throw err;
    }
  };
}

module.exports = {
  createCleanupAdobeProfileGarbageTask,
};
