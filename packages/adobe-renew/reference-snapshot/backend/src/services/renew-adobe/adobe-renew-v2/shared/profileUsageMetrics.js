const logger = require("../../../../utils/logger");

const stats = new Map();

function keyFor(flow, mode) {
  return `${String(flow || "unknown")}::${String(mode || "unknown")}`;
}

function readCounter(flow, mode) {
  return stats.get(keyFor(flow, mode)) || 0;
}

function recordProfileUsage({ flow = "unknown", mode = "unknown" } = {}) {
  const key = keyFor(flow, mode);
  const next = (stats.get(key) || 0) + 1;
  stats.set(key, next);

  const profileHit = readCounter(flow, "profile_hit");
  const profileMissing = readCounter(flow, "profile_missing");
  const profileLaunchFail = readCounter(flow, "profile_launch_fail");
  const ephemeral = readCounter(flow, "ephemeral_fallback");
  const total =
    profileHit + profileMissing + profileLaunchFail + ephemeral;

  logger.info(
    "[adobe-v2][profile-usage] flow=%s mode=%s count=%d total=%d hit=%d missing=%d launch_fail=%d fallback=%d",
    flow,
    mode,
    next,
    total,
    profileHit,
    profileMissing,
    profileLaunchFail,
    ephemeral
  );
}

function getProfileUsageSnapshot(flow = null) {
  const rows = [];
  for (const [key, count] of stats.entries()) {
    const [rowFlow, mode] = key.split("::");
    if (flow && rowFlow !== flow) continue;
    rows.push({ flow: rowFlow, mode, count });
  }
  return rows;
}

module.exports = {
  recordProfileUsage,
  getProfileUsageSnapshot,
};
