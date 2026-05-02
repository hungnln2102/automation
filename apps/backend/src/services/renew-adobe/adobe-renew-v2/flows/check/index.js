require("./contracts");

const { runCheckOrgNameFlow } = require("./checkOrgNameFlow");
const { runCheckProductFlow, extractOrgIdFromUrl, normalizeSeedOrgHex } = require("./checkProductFlow");

module.exports = {
  runCheckOrgNameFlow,
  runCheckProductFlow,
  extractOrgIdFromUrl,
  normalizeSeedOrgHex,
};
