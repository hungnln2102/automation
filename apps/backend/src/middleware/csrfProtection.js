/**
 * CSRF Protection Middleware
 * Protects state-changing operations from Cross-Site Request Forgery attacks
 * 
 * @module middleware/csrfProtection
 * 
 * @description
 * This middleware provides CSRF protection for state-changing HTTP methods
 * (POST, PUT, PATCH, DELETE). CSRF protection is ON by default.
 * 
 * To disable (dev only): Set DISABLE_CSRF=true in environment variables
 * 
 * Token can be sent via:
 * - Header: X-CSRF-Token
 * - Body: _csrf
 * - Query: _csrf
 * 
 * Token is automatically added to response headers (X-CSRF-Token)
 */

const csrf = require("csrf");
const tokens = new csrf();

/** POST công khai pricing — không session CSRF; khớp path sau mount /api, originalUrl, req.url. */
function isPublicPricingPost(req) {
  const stripped = String(req.path || "");
  const orig = String(req.originalUrl || "").split("?")[0];
  const url = String(req.url || "").split("?")[0];
  const needle = "/public/pricing/";
  return (
    stripped.startsWith(needle) ||
    url.startsWith(needle) ||
    /^\/api\/public\/pricing(\/|$)/.test(orig) ||
    /^\/api\/public\/pricing(\/|$)/.test(url)
  );
}

/**
 * Generate CSRF token for the session
 * Call this on GET requests to provide token to frontend
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware
 * @returns {void}
 */
const generateToken = (req, res, next) => {
  if (!req.session) {
    return next();
  }

  // Generate secret if not exists
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }

  // Generate token
  const token = tokens.create(req.session.csrfSecret);
  req.csrfToken = token;
  res.locals.csrfToken = token;

  next();
};

/**
 * Verify CSRF token
 * Only applies to state-changing methods (POST, PUT, PATCH, DELETE)
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware
 * @returns {void}
 * 
 * @description
 * Skips verification for:
 * - GET, HEAD, OPTIONS methods
 * - /auth/* endpoints (have their own security)
 * - /api/payment/* endpoints (have signature verification)
 * - When DISABLE_CSRF is set to "true" (dev only)
 */
const verifyToken = (req, res, next) => {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip CSRF for auth endpoints (they have their own security)
  if (req.path.startsWith("/auth/")) {
    return next();
  }

  // Skip CSRF for webhook endpoints (they have signature verification)
  if (req.path.startsWith("/api/payment/")) {
    return next();
  }

  if (isPublicPricingPost(req)) {
    return next();
  }

  const csrfDisabled = process.env.DISABLE_CSRF === "true" || process.env.DISABLE_CSRF === "1";
  if (csrfDisabled) {
    return next();
  }

  // Get token from header or body
  const token = req.headers["x-csrf-token"] || req.body?._csrf || req.query?._csrf;

  if (!token) {
    return res.status(403).json({
      error: "CSRF token missing. Please refresh the page and try again.",
      code: "CSRF_TOKEN_MISSING",
    });
  }

  // Verify token
  if (!req.session || !req.session.csrfSecret) {
    return res.status(403).json({
      error: "CSRF session expired. Please refresh the page and try again.",
      code: "CSRF_SESSION_EXPIRED",
    });
  }

  if (!tokens.verify(req.session.csrfSecret, token)) {
    return res.status(403).json({
      error: "Invalid CSRF token. Please refresh the page and try again.",
      code: "CSRF_TOKEN_INVALID",
    });
  }

  next();
};

/**
 * Middleware to add CSRF token to response headers
 * Adds token to response headers for frontend to use
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware
 * @returns {void}
 */
const addTokenToResponse = (req, res, next) => {
  if (req.csrfToken) {
    res.setHeader("X-CSRF-Token", req.csrfToken);
  }
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  addTokenToResponse,
};


