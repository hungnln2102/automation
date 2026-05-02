const {
  getSchedulerStatus,
  renewAdobeCheckAndNotifyTask,
  cleanupAdobeProfileGarbageTask,
} = require("../../scheduler/taskInstances");
const logger = require("../../utils/logger");

const schedulerStatus = (_req, res) => {
  const status = getSchedulerStatus();
  res.json({
    ...status,
    lastRunAt: status.lastRunAt ? status.lastRunAt.toISOString() : null,
  });
};

const runRenewAdobeCheckNow = async (_req, res) => {
  try {
    await renewAdobeCheckAndNotifyTask("manual");
    res.json({ success: true });
  } catch (error) {
    logger.error("[scheduler] Renew Adobe check failed", { error: error.message, stack: error.stack });
    res.status(500).json({ error: "Không thể chạy job check tài khoản Adobe." });
  }
};

const runCleanupAdobeProfileGarbageNow = async (_req, res) => {
  try {
    const result = await cleanupAdobeProfileGarbageTask("manual");
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error("[scheduler] Cleanup Adobe profile garbage failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Không thể chạy cleanup profile rác Adobe." });
  }
};

module.exports = {
  schedulerStatus,
  runRenewAdobeCheckNow,
  runCleanupAdobeProfileGarbageNow,
};
