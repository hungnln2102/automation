const { runB15RemoveProductFromAdmin } = require("../../removeProductAdminFlow");

async function runRemoveAdminProductFlow(page, adminEmail, options = {}) {
  return runB15RemoveProductFromAdmin(page, adminEmail, options);
}

module.exports = {
  runRemoveAdminProductFlow,
};
