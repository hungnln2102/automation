const { body, param, validate } = require("../middleware/validateRequest");

const productIdParam = [
  param("productId")
    .isInt({ min: 1 })
    .withMessage("ID sản phẩm không hợp lệ."),
  validate,
];

const createProductPriceRules = [
  body("sanPham").trim().notEmpty().withMessage("sanPham là bắt buộc."),
  validate,
];

const updateProductPriceRules = [
  param("productId")
    .isInt({ min: 1 })
    .withMessage("ID sản phẩm không hợp lệ."),
  validate,
];

const sourceIdParam = [
  param("productId")
    .isInt({ min: 1 })
    .withMessage("ID sản phẩm không hợp lệ."),
  param("sourceId")
    .isInt({ min: 1 })
    .withMessage("ID nguồn cung không hợp lệ."),
  validate,
];

module.exports = {
  productIdParam,
  createProductPriceRules,
  updateProductPriceRules,
  sourceIdParam,
};
