const { body, param, validate } = require("../middleware/validateRequest");

const supplyIdParam = [
  param("supplyId")
    .isInt({ min: 1 })
    .withMessage("ID nhà cung cấp không hợp lệ."),
  validate,
];

const createSupplyRules = [
  body("source_name").custom((_, { req }) => {
    const name = String(
      req.body.supplier_name ?? req.body.source_name ?? "",
    ).trim();
    if (!name) throw new Error("Tên nhà cung cấp là bắt buộc.");
    return true;
  }),
  validate,
];

const createPaymentRules = [
  param("supplyId")
    .isInt({ min: 1 })
    .withMessage("ID nhà cung cấp không hợp lệ."),
  body("round").trim().notEmpty().withMessage("Chu kỳ không hợp lệ."),
  body("paid").isFloat().withMessage("Giá trị đã thanh toán không hợp lệ."),
  body("status").trim().notEmpty().withMessage("Trạng thái không hợp lệ."),
  validate,
];

const updatePaymentRules = [
  param("supplyId")
    .isInt({ min: 1 })
    .withMessage("Mã cung cấp không hợp lệ."),
  param("paymentId")
    .isInt({ min: 1 })
    .withMessage("Mã thanh toán không hợp lệ."),
  body("totalImport")
    .isFloat()
    .withMessage("Giá trị tổng nhập không hợp lệ."),
  validate,
];

module.exports = {
  supplyIdParam,
  createSupplyRules,
  createPaymentRules,
  updatePaymentRules,
};
