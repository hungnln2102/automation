const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");

const TABLE_DEF = RENEW_ADOBE_SCHEMA.ACCOUNT;
const TABLE = tableName(TABLE_DEF.TABLE, SCHEMA_RENEW_ADOBE);
const COLS = TABLE_DEF.COLS;
const MAX_USERS_PER_ACCOUNT = 10;

module.exports = {
  TABLE_DEF,
  TABLE,
  COLS,
  MAX_USERS_PER_ACCOUNT,
};
