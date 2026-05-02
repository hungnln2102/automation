/**
 * Request Validation Middleware
 * Provides reusable validation chains and helpers
 */

const { body, param, query, validationResult } = require("express-validator");
const { AppError } = require("./errorHandler");

/**
 * Middleware to check validation results
 * Use after validation chains
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    throw new AppError("Dữ liệu không hợp lệ", 400, "VALIDATION_ERROR", errorMessages);
  }
  next();
};

/**
 * Common validation chains
 */
const validations = {
  // Order validations
  orderId: () => param("id").isInt({ min: 1 }).withMessage("ID đơn hàng không hợp lệ"),

  orderCode: () =>
    body("id_order").trim().notEmpty().withMessage("Mã đơn hàng không được để trống"),

  // id_product: variant id (number) hoặc tên sản phẩm (string)
  productId: () =>
    body("id_product")
      .custom((val) => val != null && val !== "")
      .withMessage("Mã sản phẩm không được để trống"),

  customer: () =>
    body("customer").trim().notEmpty().withMessage("Tên khách hàng không được để trống"),

  price: () =>
    body("price")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Giá bán phải là số dương"),

  days: () =>
    body("days").optional().isInt({ min: 1 }).withMessage("Số ngày phải là số nguyên dương"),

  // Supply validations
  supply: () => body("supply").optional().trim(),

  // Generic validations
  requiredString: (field, message) =>
    body(field).trim().notEmpty().withMessage(message || `${field} không được để trống`),

  optionalString: (field) => body(field).optional().trim(),

  requiredInt: (field, message) =>
    body(field).isInt().withMessage(message || `${field} phải là số nguyên`),

  optionalInt: (field) => body(field).optional().isInt(),

  requiredFloat: (field, message) =>
    body(field).isFloat().withMessage(message || `${field} phải là số`),

  optionalFloat: (field) => body(field).optional().isFloat(),
};

module.exports = {
  validate,
  validations,
  body,
  param,
  query,
};
