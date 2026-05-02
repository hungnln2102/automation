const { db } = require("../../db");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const { TABLE, COLS } = require("./accountTable");

const MAP_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const MAP_COLS = RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.COLS;

const LOOKUP_COLUMNS = [
  `${TABLE}.${COLS.ID}`,
  `${TABLE}.${COLS.EMAIL}`,
  `${TABLE}.${COLS.ORG_NAME}`,
  `${TABLE}.${COLS.LICENSE_STATUS}`,
  `${TABLE}.${COLS.USER_COUNT}`,
  `${TABLE}.${COLS.LAST_CHECKED}`,
  `${TABLE}.${COLS.IS_ACTIVE}`,
  `${TABLE}.${COLS.CREATED_AT}`,
  ...(COLS.URL_ACCESS ? [`${TABLE}.${COLS.URL_ACCESS}`] : []),
  ...(COLS.ID_PRODUCT ? [`${TABLE}.${COLS.ID_PRODUCT}`] : []),
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function createLookupQuery() {
  return db(TABLE).select(...LOOKUP_COLUMNS);
}

async function findAccountMatchByEmail(email) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) {
    return { account: null, matchedUser: null };
  }

  let row = await createLookupQuery()
    .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [COLS.EMAIL, emailLower])
    .first();

  if (row) {
    return { account: row, matchedUser: null };
  }

  const mapping = await db(MAP_TABLE)
    .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [
      MAP_COLS.USER_EMAIL,
      emailLower,
    ])
    .whereNotNull(MAP_COLS.ADOBE_ACCOUNT_ID)
    .first();

  if (mapping) {
    const accountId = Number(mapping[MAP_COLS.ADOBE_ACCOUNT_ID]);
    if (Number.isFinite(accountId) && accountId > 0) {
      row = await createLookupQuery().where(COLS.ID, accountId).first();
      if (row) {
        return {
          account: row,
          matchedUser: {
            email: emailLower,
            product: mapping[MAP_COLS.PRODUCT],
          },
        };
      }
    }
  }

  return { account: null, matchedUser: null };
}

module.exports = {
  normalizeEmail,
  findAccountMatchByEmail,
};
