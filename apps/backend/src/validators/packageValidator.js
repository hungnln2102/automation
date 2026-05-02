const { body, param, validate } = require("../middleware/validateRequest");

const packageIdParam = [
  param("id").notEmpty().withMessage("ID sản phẩm gói hàng là bắt buộc."),
  validate,
];

const createPackageRules = [
  body("package_id").custom((_, { req }) => {
    const id = Number(req.body.packageId ?? req.body.package_id);
    if (!Number.isFinite(id) || id < 1)
      throw new Error("Loại gói (product id) là bắt buộc.");
    return true;
  }),
  validate,
];

const bulkDeleteRules = [
  body("packageIds").custom((_, { req }) => {
    const raw = req.body.packageIds || req.body.packages || [];
    const ids = (Array.isArray(raw) ? raw : [raw])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1);
    if (!ids.length)
      throw new Error("Cần ít nhất một package_id để xóa.");
    return true;
  }),
  validate,
];

module.exports = { packageIdParam, createPackageRules, bulkDeleteRules };
