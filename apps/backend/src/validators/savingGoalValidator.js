const { body, param, validate } = require("../middleware/validateRequest");

const goalIdParam = [
  param("id").isInt({ min: 1 }).withMessage("ID không hợp lệ."),
  validate,
];

const createGoalRules = [
  body("goal_name")
    .trim()
    .notEmpty()
    .withMessage("Tên mục tiêu không được để trống."),
  body("target_amount")
    .isFloat({ gt: 0 })
    .withMessage("Số tiền mục tiêu phải lớn hơn 0."),
  validate,
];

const updatePriorityRules = [
  param("id").isInt({ min: 1 }).withMessage("ID không hợp lệ."),
  body("priority").isNumeric().withMessage("Priority phải là số."),
  validate,
];

module.exports = { goalIdParam, createGoalRules, updatePriorityRules };
