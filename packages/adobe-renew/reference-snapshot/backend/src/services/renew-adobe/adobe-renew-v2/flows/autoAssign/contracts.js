/**
 * Hop dong I/O cho nhom flow auto-assign.
 */

/**
 * @typedef {Object} AutoAssignFlowContext
 * @property {import("playwright").Page} page
 * @property {number} accountId
 * @property {string} accountEmail
 * @property {Object | null} [savedSession]
 */

/**
 * @typedef {Object} AutoAssignResult
 * @property {boolean} success
 * @property {string | null} url
 * @property {boolean} createdNew
 * @property {string | null} [errorCode]
 */

module.exports = {};
