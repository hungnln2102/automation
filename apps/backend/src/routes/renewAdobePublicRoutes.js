const express = require("express");
const { sendPublicOtp } = require("../controllers/RenewAdobeController/publicOtp");
const { sensitiveLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/otp", sensitiveLimiter, sendPublicOtp);

module.exports = router;
