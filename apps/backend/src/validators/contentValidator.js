const { body, param, validate } = require("../middleware/validateRequest");

const contentIdParam = [
  param("id").isInt({ min: 1 }).withMessage("ID không hợp lệ."),
  validate,
];

const createArticleRules = [
  body("title").trim().notEmpty().withMessage("Tiêu đề bắt buộc."),
  validate,
];

const updateArticleRules = [
  param("id").isInt({ min: 1 }).withMessage("ID không hợp lệ."),
  body("title").trim().notEmpty().withMessage("Tiêu đề bắt buộc."),
  validate,
];

const createBannerRules = [
  body("image_url").trim().notEmpty().withMessage("URL ảnh bắt buộc."),
  body("title").trim().notEmpty().withMessage("Tiêu đề bắt buộc."),
  validate,
];

const reorderBannerRules = [
  body("ids").isArray({ min: 1 }).withMessage("Danh sách ID bắt buộc."),
  validate,
];

const createContentCategoryRules = [
  body("name").trim().notEmpty().withMessage("Tên danh mục bắt buộc."),
  validate,
];

const updateContentCategoryRules = [
  param("id").isInt({ min: 1 }).withMessage("ID không hợp lệ."),
  body("name").trim().notEmpty().withMessage("Tên danh mục bắt buộc."),
  validate,
];

module.exports = {
  contentIdParam,
  createArticleRules,
  updateArticleRules,
  createBannerRules,
  reorderBannerRules,
  createContentCategoryRules,
  updateContentCategoryRules,
};
