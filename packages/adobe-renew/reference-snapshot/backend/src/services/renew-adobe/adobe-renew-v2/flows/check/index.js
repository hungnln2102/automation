require("./contracts");

const { runCheckOrgNameFlow } = require("./checkOrgNameFlow");
const { runCheckProductFlow, extractOrgIdFromUrl } = require("./checkProductFlow");

module.exports = {
  runCheckOrgNameFlow,
  runCheckProductFlow,
  extractOrgIdFromUrl,
};
