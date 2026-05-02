const { body, param, validate } = require("../middleware/validateRequest");

const categoryIdParam = [
  param("id").isInt({ min: 1 }).withMessage("Invalid category ID."),
  validate,
];

const createCategoryRules = [
  body("name").trim().notEmpty().withMessage("Category name is required."),
  validate,
];

module.exports = { categoryIdParam, createCategoryRules };
