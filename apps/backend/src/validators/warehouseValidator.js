const { param, validate } = require("../middleware/validateRequest");

const warehouseIdParam = [
  param("id").notEmpty().withMessage("Missing id"),
  validate,
];

module.exports = { warehouseIdParam };
