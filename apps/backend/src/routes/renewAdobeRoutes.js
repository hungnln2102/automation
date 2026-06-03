const express = require("express");
const {
  listAccounts,
  createAccount,
  createAccountsBulk,
  deleteAccount,
  runCheck,
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
} = require("../controllers/RenewAdobeController");

const router = express.Router();

router.get("/proxy-pool", listProxyPool);
router.post("/proxy-pool", createProxyPoolItem);
router.get("/proxy-pool/:id/test", testProxyPoolItem);
router.patch("/proxy-pool/:id", updateProxyPoolItem);
router.delete("/proxy-pool/:id", deleteProxyPoolItem);

router.get("/mail-backup", listMailBackupMailboxes);
router.post("/mail-backup", createMailBackupMailbox);
router.get("/mail-backup/:id/test", testMailBackupMailbox);
router.patch("/mail-backup/:id", updateMailBackupMailbox);
router.delete("/mail-backup/:id", deleteMailBackupMailbox);

router.get("/accounts", listAccounts);
router.post("/accounts", createAccount);
router.post("/accounts/bulk", createAccountsBulk);
router.delete("/accounts/:id", deleteAccount);
router.get("/accounts/check-all", checkAllAccounts);
router.get("/user-orders", listUserOrders);
router.post("/user-orders", createListUser);
router.delete("/user-orders/:id", deleteListUser);
router.post("/fix-user", fixSingleUser);
router.post("/fix-users-round", fixUsersRound);
router.post("/check-with-cookies", runCheckWithCookies);
router.post("/accounts/:id/check", runCheck);
router.post("/accounts/:id/auto-delete-users", runAutoDeleteUsers);
router.patch("/accounts/:id/url-access", updateUrlAccess);
router.patch("/accounts/:id", updateAccount);

module.exports = router;
