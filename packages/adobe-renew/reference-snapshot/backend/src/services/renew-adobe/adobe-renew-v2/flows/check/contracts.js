/**
 * Hop dong I/O cho nhom flow check.
 */

/**
 * @typedef {Object} CheckFlowContext
 * @property {import("playwright").Page} page
 * @property {string} accountEmail
 * @property {number} accountId
 * @property {Object} [runtime]
 */

/**
 * @typedef {Object} OrgCheckResult
 * @property {boolean} success
 * @property {string | null} orgName
 * @property {string | null} [errorCode]
 */

/**
 * @typedef {Object} ProductCheckResult
 * @property {boolean} success
 * @property {string} licenseStatus
 * @property {string | null} [licenseDetail]
 * @property {boolean} hasPlan
 * @property {string | null} [errorCode]
 */

module.exports = {};
