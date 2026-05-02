/**
 * Hop dong I/O cho nhom flow dang nhap.
 */

/**
 * @typedef {Object} LoginContext
 * @property {import("playwright").Page} page
 * @property {string} accountEmail
 * @property {string} passwordEncrypted
 * @property {"imap" | "tinyhost" | "hdsd"} [otpSource]
 * @property {number | null} [mailBackupId]
 * @property {string | null} [proxyUrl]
 */

/**
 * @typedef {Object} SessionState
 * @property {Array<Object>} cookies
 * @property {string | null} [savedAt]
 */

/**
 * @typedef {Object} CredentialsFlowResult
 * @property {boolean} success
 * @property {string} finalUrl
 * @property {SessionState | null} [session]
 * @property {string | null} [errorCode]
 */

/**
 * @typedef {Object} OtpFlowResult
 * @property {boolean} success
 * @property {string} sourceUsed
 * @property {string | null} [otpCodeMasked]
 * @property {string | null} [errorCode]
 */

/**
 * @typedef {Object} SessionValidationResult
 * @property {boolean} isValid
 * @property {boolean} needsRelogin
 * @property {string | null} [reason]
 */

module.exports = {};
