const { body, param, validate } = require("../middleware/validateRequest");

const saveDailyBalanceRules = [
  body("recordDate")
    .trim()
    .notEmpty()
    .withMessage("recordDate không hợp lệ."),
  body("values").isObject().withMessage("values không hợp lệ."),
  validate,
];

const createWalletTypeRules = [
  body("wallet_name").trim().notEmpty().withMessage("Tên cột không được để trống."),
  body("note")
    .optional({ values: "null" })
    .custom((v) => v === null || v === undefined || typeof v === "string")
    .withMessage("note không hợp lệ."),
  body("asset_code").optional({ values: "null" }).trim().isLength({ max: 50 }),
  body("is_investment").optional().isBoolean().withMessage("is_investment phải là true hoặc false."),
  body("balance_scope")
    .optional()
    .isIn(["per_row", "column_total"])
    .withMessage("balance_scope phải là per_row hoặc column_total."),
  validate,
];

const updateWalletTypeRules = [
  param("id").isInt({ min: 1 }).withMessage("ID cột ví không hợp lệ."),
  body("wallet_name").optional().trim().notEmpty().withMessage("Tên cột không được để trống."),
  body("note")
    .optional({ values: "null" })
    .custom((v) => v === null || v === undefined || typeof v === "string")
    .withMessage("note không hợp lệ."),
  body("asset_code").optional({ values: "null" }).trim().isLength({ max: 50 }),
  body("is_investment").optional().isBoolean(),
  body("balance_scope")
    .optional()
    .isIn(["per_row", "column_total"])
    .withMessage("balance_scope phải là per_row hoặc column_total."),
  validate,
];

const deleteWalletTypeRules = [
  param("id").isInt({ min: 1 }).withMessage("ID cột ví không hợp lệ."),
  validate,
];

module.exports = {
  saveDailyBalanceRules,
  createWalletTypeRules,
  updateWalletTypeRules,
  deleteWalletTypeRules,
};
