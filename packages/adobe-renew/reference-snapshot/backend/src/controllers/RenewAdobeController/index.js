const {
  listMailBackupMailboxes,
  createMailBackupMailbox,
  listAccounts,
  lookupAccountByEmail,
  createAccount,
  deleteAccount,
  updateUrlAccess,
  updateAccount,
} = require("./accounts");
const {
  runCheckForAccountId,
  runCheck,
  runCheckWithCookies,
} = require("./checkAccounts");
const {
  runAddUsersBatch,
  runAutoDeleteUsers: runAutoDeleteUsersHandler,
} = require("./batchUsers");
const {
  adobeQueueStatus,
  checkAllAccounts: checkAllAccountsHandler,
  autoAssignUsers,
  runAutoAssign,
  fixSingleUser,
  fixUsersRound,
} = require("./autoAssign");
const {
  listVariants,
  listProductSystem,
  createProductSystem,
  deleteProductSystem,
} = require("./productSystem");
const { listUserOrders } = require("./userOrders");
const {
  getWebsiteStatus,
  activateWebsiteUser,
} = require("./publicWebsite");

const runAutoDeleteUsers = (req, res) =>
  runAutoDeleteUsersHandler({
    req,
    res,
    runCheckForAccountId,
  });
const checkAllAccounts = (req, res) =>
  checkAllAccountsHandler({
    req,
    res,
    runCheckForAccountId,
  });

module.exports = {
  listMailBackupMailboxes,
  createMailBackupMailbox,
  listAccounts,
  lookupAccountByEmail,
  createAccount,
  deleteAccount,
  runCheck,
  runCheckForAccountId,
  runCheckWithCookies,
  runAddUsersBatch,
  runAutoDeleteUsers,
  adobeQueueStatus,
  checkAllAccounts,
  listUserOrders,
  autoAssignUsers,
  runAutoAssign,
  fixSingleUser,
  fixUsersRound,
  updateUrlAccess,
  updateAccount,
  listVariants,
  listProductSystem,
  createProductSystem,
  deleteProductSystem,
  getWebsiteStatus,
  activateWebsiteUser,
};
