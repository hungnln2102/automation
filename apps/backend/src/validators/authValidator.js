const { body, validate } = require("../middleware/validateRequest");

const loginRules = [
  body("username").trim().notEmpty().withMessage("Tên đăng nhập là bắt buộc"),
  body("password").notEmpty().withMessage("Mật khẩu là bắt buộc"),
  validate,
];

const changePasswordRules = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Mật khẩu hiện tại là bắt buộc"),
  body("newPassword").notEmpty().withMessage("Mật khẩu mới là bắt buộc"),
  body("confirmPassword")
    .notEmpty()
    .withMessage("Xác nhận mật khẩu là bắt buộc")
    .custom((val, { req }) => {
      if (val !== req.body.newPassword)
        throw new Error("Mật khẩu mới không khớp");
      return true;
    }),
  validate,
];

module.exports = { loginRules, changePasswordRules };
