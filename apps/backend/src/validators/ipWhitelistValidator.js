const { body, validate } = require("../middleware/validateRequest");

const createIpWhitelistRules = [
  body("ipAddress")
    .customSanitizer((v) => String(v ?? "").trim())
    .notEmpty()
    .withMessage("Địa chỉ IP là bắt buộc."),
  validate,
];

module.exports = { createIpWhitelistRules };
