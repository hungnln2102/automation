const config = require("./config");
const { createRenewAdobeCheckAndNotifyTask } = require("./tasks/renewAdobeCheckAndNotify");
const {
  createCleanupAdobeProfileGarbageTask,
} = require("./tasks/cleanupAdobeProfileGarbage");

const { schedulerTimezone, cronExpression, runOnStart } = config;

const renewAdobeCheckAndNotifyTask = createRenewAdobeCheckAndNotifyTask();
const cleanupAdobeProfileGarbageTask = createCleanupAdobeProfileGarbageTask();

function getSchedulerStatus() {
  return {
    timezone: schedulerTimezone,
    cronExpression,
    runOnStart,
    lastRunAt: null,
  };
}

module.exports = {
  renewAdobeCheckAndNotifyTask,
  cleanupAdobeProfileGarbageTask,
  getSchedulerStatus,
  schedulerTimezone,
  cronExpression,
  runOnStart,
};
