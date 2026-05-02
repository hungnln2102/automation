/**
 * Snapshot tham chiếu — không được require bởi backend trong production.
 */
const { RENEW_ADOBE_SCHEMA } = require("./schemas/automation");
const {
  tableName,
  getTable,
  getColumns,
  getDefinition,
} = require("./helpers");
const { DEFAULT_SCHEMA_SYSTEM_AUTOMATION } = require("./env.defaults");

module.exports = {
  SCHEMA_SYSTEM_AUTOMATION: DEFAULT_SCHEMA_SYSTEM_AUTOMATION,
  /** Alias trùng tên export trong backend (dbSchema.js). */
  SCHEMA_RENEW_ADOBE: DEFAULT_SCHEMA_SYSTEM_AUTOMATION,
  RENEW_ADOBE_SCHEMA,
  tableName,
  getTable,
  getColumns,
  getDefinition,
};
