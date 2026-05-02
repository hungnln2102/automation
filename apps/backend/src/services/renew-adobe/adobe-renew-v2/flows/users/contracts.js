/**
 * Hop dong I/O cho nhom flow users.
 */

/**
 * @typedef {Object} UsersFlowContext
 * @property {import("playwright").Page} page
 * @property {number} accountId
 * @property {string} accountEmail
 */

/**
 * @typedef {Object} UsersSnapshot
 * @property {number} userCount
 * @property {Array<{ email: string, name?: string, product?: string }>} users
 */

/**
 * @typedef {Object} AdminProductCheckResult
 * @property {boolean} hasAdminProduct
 * @property {string | null} [productName]
 */

/**
 * @typedef {Object} BatchActionResult
 * @property {boolean} success
 * @property {string[]} done
 * @property {Array<{ email: string, reason: string }>} failed
 * @property {boolean} stoppedByPolicy
 */

module.exports = {};
