const express = require("express");
const { sendPublicOtp } = require("../controllers/RenewAdobeController/publicOtp");

const router = express.Router();

router.post("/otp", sendPublicOtp);

module.exports = router;
