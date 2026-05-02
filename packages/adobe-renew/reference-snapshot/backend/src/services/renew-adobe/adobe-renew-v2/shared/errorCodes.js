const FLOW_ERROR_CODES = Object.freeze({
  TIMEOUT: "timeout",
  OTP_NOT_FOUND: "otp_not_found",
  OTP_PROVIDER_FAILED: "otp_provider_failed",
  REDIRECT_INVALID: "redirect_invalid",
  SESSION_EXPIRED: "session_expired",
  SESSION_MISSING: "session_missing",
  SELECTOR_MISSING: "selector_missing",
  NAVIGATION_FAILED: "navigation_failed",
  BATCH_STOPPED_BY_POLICY: "batch_stopped_by_policy",
  UNKNOWN: "unknown",
});

function isAdobeFlowErrorCode(value) {
  return Object.values(FLOW_ERROR_CODES).includes(String(value || ""));
}

module.exports = {
  FLOW_ERROR_CODES,
  isAdobeFlowErrorCode,
};
