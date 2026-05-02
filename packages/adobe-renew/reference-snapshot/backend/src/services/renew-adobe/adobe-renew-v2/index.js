/**
 * Adobe Renew V2 — Hệ thống mới theo luồng B1–B13 + B14 auto-assign (doc: Renew_Adobe_V2_Flow.md).
 */

const { runCheckFlow, toPwCookies, fromPwCookies } = require("./runCheckFlow");
const { getOrCreateAutoAssignUrlWithPage } = require("./autoAssignFlow");
const { doFormLoginOnAuthPage } = require("./loginFlow");
const { runB15RemoveProductFromAdmin } = require("./removeProductAdminFlow");
const { deleteUsersV2 } = require("./deleteUsersV2");
const { addUsersWithProductV2 } = require("./addUsersWithProductV2");
const flows = require("./flows");
const facade = require("./facade");

module.exports = {
  runCheckFlow,
  toPwCookies,
  fromPwCookies,
  getOrCreateAutoAssignUrlWithPage,
  doFormLoginOnAuthPage,
  runB15RemoveProductFromAdmin,
  deleteUsersV2,
  addUsersWithProductV2,
  flows,
  checkAccount: facade.checkAccount,
  addUsersWithProduct: facade.addUsersWithProduct,
  removeUserFromAccount: facade.removeUserFromAccount,
  autoDeleteUsers: facade.autoDeleteUsers,
};
