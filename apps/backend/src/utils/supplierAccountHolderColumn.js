/**
 * Migration 035 adds partner.supplier.account_holder.
 * If the column is missing, callers must not reference it in SQL.
 * We only cache a positive result so that after migration the next request picks up the column without restart.
 */
const { supplierCache } = require("./cache");

let accountHolderColumnKnownPresent = false;

const parseQualifiedTable = (qualifiedName) => {
  const name = String(qualifiedName || "").trim().toLowerCase();
  const dot = name.indexOf(".");
  if (dot === -1) {
    return { schema: "public", table: name };
  }
  return { schema: name.slice(0, dot), table: name.slice(dot + 1) };
};

/**
 * @param {import("knex").Knex} db
 * @param {string} qualifiedTable e.g. "partner.supplier"
 */
const supplierHasAccountHolderColumn = async (db, qualifiedTable) => {
  if (accountHolderColumnKnownPresent) return true;
  const { schema, table } = parseQualifiedTable(qualifiedTable);
  const row = await db("information_schema.columns")
    .select("column_name")
    .where({
      table_schema: schema,
      table_name: table,
      column_name: "account_holder",
    })
    .first();
  if (row) {
    const firstDetection = !accountHolderColumnKnownPresent;
    accountHolderColumnKnownPresent = true;
    if (firstDetection) {
      supplierCache.clear();
    }
    return true;
  }
  return false;
};

module.exports = {
  supplierHasAccountHolderColumn,
  parseQualifiedTable,
};
