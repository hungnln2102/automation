const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const logger = require("../../../../utils/logger");

function sanitizeEmailForPath(email) {
  return String(email || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "_")
    .replace(/@/g, "_at_");
}

function getProfilesRootDir() {
  const envDir = String(process.env.ADOBE_PROFILE_DIR || "").trim();
  if (envDir) return path.resolve(envDir);
  return path.resolve(process.cwd(), ".adobe-profiles");
}

function getProfileDirForEmail(email) {
  const root = getProfilesRootDir();
  const key = sanitizeEmailForPath(email);
  return path.join(root, key);
}

function hasExistingProfileForEmail(email) {
  const profileDir = getProfileDirForEmail(email);
  if (!fs.existsSync(profileDir)) {
    return false;
  }
  try {
    const entries = fs.readdirSync(profileDir);
    return entries.length > 0;
  } catch (_) {
    return false;
  }
}

function removeProfileDirForEmail(email) {
  const profileDir = getProfileDirForEmail(email);
  if (!fs.existsSync(profileDir)) {
    return { removed: false, profileDir, reason: "not_found" };
  }
  fs.rmSync(profileDir, { recursive: true, force: true });
  return { removed: true, profileDir };
}

async function launchSessionFromProfile({
  adminEmail,
  headless = true,
  proxyOptions = null,
}) {
  const profileDir = getProfileDirForEmail(adminEmail);
  fs.mkdirSync(profileDir, { recursive: true });

  const launchOptions = {
    headless,
    slowMo: headless ? 0 : 80,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-quic",
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  };
  if (proxyOptions) launchOptions.proxy = proxyOptions;

  logger.info("[adobe-v2] profile-session: launch persistent context dir=%s", profileDir);
  const context = await chromium.launchPersistentContext(profileDir, launchOptions);
  const page = context.pages()[0] || (await context.newPage());
  return { context, page, profileDir };
}

module.exports = {
  sanitizeEmailForPath,
  getProfilesRootDir,
  launchSessionFromProfile,
  hasExistingProfileForEmail,
  getProfileDirForEmail,
  removeProfileDirForEmail,
};

