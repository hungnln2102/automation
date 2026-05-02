const {
  listAccounts,
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
  checkAllAccounts: checkAllAccountsHandler,
} = require("./autoAssign");
const { listUserOrders, createListUser } = require("./userOrders");
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
  deleteAccount,
  runCheck,
  runCheckForAccountId,
  runCheckWithCookies,
  checkAllAccounts,
  listUserOrders,
  createListUser,
  fixSingleUser,
  fixUsersRound,
  runAutoDeleteUsers,
  updateUrlAccess,
  updateAccount,
};
