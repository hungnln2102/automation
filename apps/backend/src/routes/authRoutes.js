const express = require("express");
const {
  login,
  logout,
  me,
  getCsrfToken,
  changePassword,
} = require("../controllers/AuthController");
const { authLimiter, sensitiveLimiter, apiLimiter } = require("../middleware/rateLimiter");
const { loginRules, changePasswordRules } = require("../validators/authValidator");

const router = express.Router();

router.post("/login", authLimiter, ...loginRules, login);
router.post("/logout", logout);
router.get("/me", apiLimiter, me);
router.get("/csrf-token", apiLimiter, getCsrfToken);
router.post("/change-password", sensitiveLimiter, ...changePasswordRules, changePassword);

module.exports = router;
