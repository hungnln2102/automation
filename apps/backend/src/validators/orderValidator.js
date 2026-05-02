const { param, validate } = require("../middleware/validateRequest");

const orderIdParam = [
  param("id").isInt({ min: 1 }).withMessage("ID đơn hàng không hợp lệ"),
  validate,
];

const orderCodeParam = [
  param("orderCode")
    .trim()
    .notEmpty()
    .withMessage("Mã đơn hàng không được để trống"),
  validate,
];

module.exports = { orderIdParam, orderCodeParam };
