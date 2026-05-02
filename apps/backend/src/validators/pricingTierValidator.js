const { body, param, validate } = require("../middleware/validateRequest");

const tierIdParam = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID pricing tier không hợp lệ."),
  validate,
];

const createTierRules = [
  body("key").trim().notEmpty().withMessage("key là bắt buộc."),
  body("prefix").trim().notEmpty().withMessage("prefix là bắt buộc."),
  body("label").trim().notEmpty().withMessage("label là bắt buộc."),
  body("pricing_rule")
    .trim()
    .notEmpty()
    .withMessage("pricing_rule là bắt buộc."),
  validate,
];

const variantIdParam = [
  param("id").isInt({ min: 1 }).withMessage("variant_id không hợp lệ."),
  validate,
];

const upsertMarginsRules = [
  param("id").isInt({ min: 1 }).withMessage("variant_id không hợp lệ."),
  body("margins")
    .isArray()
    .withMessage("margins phải là mảng [{ tier_id, margin_ratio }]."),
  validate,
];

module.exports = {
  tierIdParam,
  createTierRules,
  variantIdParam,
  upsertMarginsRules,
};
