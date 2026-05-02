const { body, param, validate } = require("../middleware/validateRequest");

const formIdParam = [
  param("formId").isInt({ min: 1 }).withMessage("ID không hợp lệ"),
  validate,
];

const createFormRules = [
  body("name").trim().notEmpty().withMessage("Tên form không được để trống"),
  validate,
];

const createInputRules = [
  body("name").trim().notEmpty().withMessage("Tên input không được để trống"),
  validate,
];

module.exports = { formIdParam, createFormRules, createInputRules };
