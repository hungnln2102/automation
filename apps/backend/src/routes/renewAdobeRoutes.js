const express = require("express");
const {
  listAccounts,
  createAccount,
  deleteAccount,
  runCheck,
  runCheckWithCookies,
  checkAllAccounts,
  listUserOrders,
  createListUser,
  fixSingleUser,
  fixUsersRound,
  runAutoDeleteUsers,
  updateUrlAccess,
  updateAccount,
} = require("../controllers/RenewAdobeController");

const router = express.Router();

router.get("/accounts", listAccounts);
router.post("/accounts", createAccount);
router.delete("/accounts/:id", deleteAccount);
router.get("/accounts/check-all", checkAllAccounts);
router.get("/user-orders", listUserOrders);
router.post("/user-orders", createListUser);
router.post("/fix-user", fixSingleUser);
router.post("/fix-users-round", fixUsersRound);
router.post("/check-with-cookies", runCheckWithCookies);
router.post("/accounts/:id/check", runCheck);
router.post("/accounts/:id/auto-delete-users", runAutoDeleteUsers);
router.patch("/accounts/:id/url-access", updateUrlAccess);
router.patch("/accounts/:id", updateAccount);

module.exports = router;
