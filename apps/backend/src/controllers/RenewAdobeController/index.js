const {
  listAccounts,
  createAccount,
  createAccountsBulk,
  deleteAccount,
  updateUrlAccess,
  updateAccount,
} = require("./accounts");
const {
  listMailBackupMailboxes,
  createMailBackupMailbox,
  updateMailBackupMailbox,
  deleteMailBackupMailbox,
  testMailBackupMailbox,
} = require("./mailBackup");
const {
  listProxyPool,
  createProxyPoolItem,
  updateProxyPoolItem,
  deleteProxyPoolItem,
  testProxyPoolItem,
} = require("./proxyPool");
const {
  runCheckForAccountId,
  runCheck,
  runCheckWithCookies,
} = require("./checkAccounts");
const {
  checkAllAccounts: checkAllAccountsHandler,
} = require("./autoAssign");
const { listUserOrders, createListUser, deleteListUser } = require("./userOrders");
const { fixSingleUser, fixUsersRound } = require("./fixUserHandlers");
const { runAutoDeleteUsers } = require("./autoDeleteUsersHandler");

const checkAllAccounts = (req, res) =>
  checkAllAccountsHandler({
    req,
    res,
    runCheckForAccountId,
  });

module.exports = {
  listAccounts,
  createAccount,
  createAccountsBulk,
  deleteAccount,
  runCheck,
  runCheckForAccountId,
  runCheckWithCookies,
  checkAllAccounts,
  listUserOrders,
  createListUser,
  deleteListUser,
  fixSingleUser,
  fixUsersRound,
  runAutoDeleteUsers,
  updateUrlAccess,
  updateAccount,
  listMailBackupMailboxes,
  createMailBackupMailbox,
  updateMailBackupMailbox,
  deleteMailBackupMailbox,
  testMailBackupMailbox,
  listProxyPool,
  createProxyPoolItem,
  updateProxyPoolItem,
  deleteProxyPoolItem,
  testProxyPoolItem,
};
