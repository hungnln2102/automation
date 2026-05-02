const { db } = require("../../db");
const { TABLE, COLS } = require("./accountTable");

const LOOKUP_COLUMNS = [
  `${TABLE}.${COLS.ID}`,
  `${TABLE}.${COLS.EMAIL}`,
  `${TABLE}.${COLS.ORG_NAME}`,
  ...(COLS.ADOBE_ORG_ID ? [`${TABLE}.${COLS.ADOBE_ORG_ID}`] : []),
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

  const row = await createLookupQuery()
    .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [COLS.EMAIL, emailLower])
    .first();

  if (row) {
    return { account: row, matchedUser: null };
  }

  return { account: null, matchedUser: null };
}

module.exports = {
  normalizeEmail,
  findAccountMatchByEmail,
};
