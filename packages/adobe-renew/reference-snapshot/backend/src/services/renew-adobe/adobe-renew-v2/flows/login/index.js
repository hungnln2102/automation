require("./contracts");

const { LOGIN_TIMEOUTS } = require("./loginTimeouts");
const credentialsFlow = require("./credentialsFlow");
const otpFlow = require("./otpFlow");
const sessionFlow = require("./sessionFlow");

module.exports = {
  LOGIN_TIMEOUTS,
  ...credentialsFlow,
  ...otpFlow,
  ...sessionFlow,
};
