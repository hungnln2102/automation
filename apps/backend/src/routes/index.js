const express = require("express");
const authRoutes = require("./authRoutes");
const renewAdobeRoutes = require("./renewAdobeRoutes");
const renewAdobePublicRoutes = require("./renewAdobePublicRoutes");
const { getRenewAdobeProxy } = require("./renewAdobeProxy");
const { authGuard } = require("../middleware/authGuard");
const { notifyError } = require("../utils/telegramErrorNotifier");

const longTimeout = (ms) => (req, res, next) => {
  req.setTimeout(ms);
  res.setTimeout(ms);
  next();
};

const renewAdobeMount = (() => {
  const proxy = getRenewAdobeProxy();
  return proxy != null ? proxy : renewAdobeRoutes;
})();

const router = express.Router();
let lastFrontendReport = 0;

router.use("/auth", authRoutes);

router.post("/error-report", (req, res) => {
  const now = Date.now();
  if (now - lastFrontendReport < 1000) {
    return res.status(429).json({ ok: false });
  }
  lastFrontendReport = now;

  const { message, stack, url, extra } = req.body || {};
  if (!message) return res.status(400).json({ ok: false });

  notifyError({
    message: String(message).slice(0, 500),
    source: "frontend",
    url: String(url || "").slice(0, 200),
    stack: String(stack || "").slice(0, 500),
    extra: extra ? String(extra).slice(0, 200) : undefined,
  });

  return res.json({ ok: true });
});

router.use("/renew-adobe/public", renewAdobePublicRoutes);

router.use(authGuard);
router.use("/renew-adobe", longTimeout(900_000), renewAdobeMount);

module.exports = router;
