const express = require("express");
const {
  getWebsiteStatus,
  activateWebsiteUser,
} = require("../controllers/RenewAdobeController");
const {
  requireRenewAdobePublicActivateKey,
} = require("../middleware/renewAdobePublicActivateKey");

const router = express.Router();

router.get("/status", getWebsiteStatus);
router.post("/activate", requireRenewAdobePublicActivateKey, activateWebsiteUser);

module.exports = router;
