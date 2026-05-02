const { query, validate } = require("../middleware/validateRequest");

const dateRangeRules = [
  query("from")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("from phải có định dạng yyyy-mm-dd"),
  query("to")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("to phải có định dạng yyyy-mm-dd"),
  validate,
];

module.exports = { dateRangeRules };
