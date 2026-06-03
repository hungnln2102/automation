const express = require("express");
const { sendPublicOtp } = require("../controllers/RenewAdobeController/publicOtp");
const { getPublicStatus } = require("../controllers/RenewAdobeController/publicStatus");
const { activatePublicProfile } = require("../controllers/RenewAdobeController/publicActivate");

const router = express.Router();

router.get("/status", getPublicStatus);
router.post("/activate", activatePublicProfile);
router.post("/otp", sendPublicOtp);

module.exports = router;
