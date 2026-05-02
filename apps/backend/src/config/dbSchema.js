const {
  SCHEMA_ADMIN,
  SCHEMA_MAIL_BACKUP,
  SCHEMA_RENEW_ADOBE,
  NOTIFICATION_GROUP_ID,
  RENEWAL_TOPIC_ID,
} = require("./dbSchema/env");
const {
  tableName,
  getTable,
  getColumns,
  getDefinition,
} = require("./dbSchema/helpers");
const { ADMIN_SCHEMA } = require("./dbSchema/schemas/adminFinance");
const { IDENTITY_SCHEMA } = require("./dbSchema/schemas/formsIdentity");
const { RENEW_ADOBE_SCHEMA } = require("./dbSchema/schemas/automation");

module.exports = {
  SCHEMA_ADMIN,
  SCHEMA_MAIL_BACKUP,
  SCHEMA_RENEW_ADOBE,
  NOTIFICATION_GROUP_ID,
  RENEWAL_TOPIC_ID,
  tableName,
  getTable,
  getColumns,
  getDefinition,
  ADMIN_SCHEMA,
  IDENTITY_SCHEMA,
  RENEW_ADOBE_SCHEMA,
};
