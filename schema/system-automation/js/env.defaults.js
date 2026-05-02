/**
 * Default PostgreSQL schema name for Automation/apps/backend.
 * (`dbSchema/env.js`): Renew Adobe automation tables.
 *
 * Override trên backend bằng (tùy chỉ một trong các biến được pick):
 *   DB_SCHEMA_SYSTEM_AUTOMATION, SCHEMA_SYSTEM_AUTOMATION,
 *   DB_SCHEMA_RENEW_ADOBE, SCHEMA_RENEW_ADOBE,
 *   DB_SCHEMA_MAIL_BACKUP …
 */

module.exports = {
  /** Schema chứa accounts_admin và list_user. */
  DEFAULT_SCHEMA_SYSTEM_AUTOMATION: "system_automation",
};
