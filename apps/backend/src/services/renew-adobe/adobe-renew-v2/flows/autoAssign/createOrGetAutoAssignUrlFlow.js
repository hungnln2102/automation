const { getOrCreateAutoAssignUrlWithPage } = require("../../autoAssignFlow");

async function runCreateOrGetAutoAssignUrlFlow(
  page,
  orgId,
  email,
  password,
  options = {}
) {
  return getOrCreateAutoAssignUrlWithPage(page, orgId, email, password, options);
}

module.exports = {
  runCreateOrGetAutoAssignUrlFlow,
};
