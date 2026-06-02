const config = require("./config");
const { createRenewAdobeCheckAndNotifyTask } = require("./tasks/renewAdobeCheckAndNotify");
const {
  createCleanupAdobeProfileGarbageTask,
} = require("./tasks/cleanupAdobeProfileGarbage");
const {
  createCleanupExpiredListUsersTask,
} = require("./tasks/cleanupExpiredListUsers");

const { schedulerTimezone, cronExpression, runOnStart } = config;

const renewAdobeCheckAndNotifyTask = createRenewAdobeCheckAndNotifyTask();
const cleanupAdobeProfileGarbageTask = createCleanupAdobeProfileGarbageTask();
const cleanupExpiredListUsersTask = createCleanupExpiredListUsersTask();

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
  cleanupExpiredListUsersTask,
  getSchedulerStatus,
  schedulerTimezone,
  cronExpression,
  runOnStart,
};
