const { Pool } = require("pg");
const { loadBackendEnv } = require("../../src/config/loadEnv");
const schema = require("../../src/config/dbSchema");

loadBackendEnv();

const specs = [
  ["ADMIN_SCHEMA", schema.SCHEMA_ADMIN, schema.ADMIN_SCHEMA],
  ["FINANCE_SCHEMA", schema.SCHEMA_FINANCE, schema.FINANCE_SCHEMA],
  ["COMMON_SCHEMA", schema.SCHEMA_COMMON, schema.COMMON_SCHEMA],
  [
    "IDENTITY_SCHEMA",
    schema.SCHEMA_IDENTITY,
    {
      ACCOUNTS: schema.IDENTITY_SCHEMA.ACCOUNTS,
      ROLES: schema.IDENTITY_SCHEMA.ROLES,
      CUSTOMER_PROFILES: schema.IDENTITY_SCHEMA.CUSTOMER_PROFILES,
    },
  ],
  [
    "MAIL_BACKUP_SCHEMA",
    schema.SCHEMA_MAIL_BACKUP,
    { MAIL_BACKUP: schema.IDENTITY_SCHEMA.MAIL_BACKUP },
  ],
  ["PROMOTION_SCHEMA", schema.SCHEMA_PROMOTION, schema.PROMOTION_SCHEMA],
  ["WALLET_SCHEMA", schema.SCHEMA_WALLET, schema.WALLET_SCHEMA],
  ["FORM_DESC_SCHEMA", schema.SCHEMA_FORM_DESC, schema.FORM_DESC_SCHEMA],
  ["PRODUCT_SCHEMA", schema.SCHEMA_PRODUCT, schema.PRODUCT_SCHEMA],
  ["PRICING_TIER_SCHEMA", schema.SCHEMA_PRODUCT, schema.PRICING_TIER_SCHEMA],
  [
    "PARTNER_SCHEMA",
    schema.SCHEMA_PARTNER,
    {
      SUPPLIER: schema.PARTNER_SCHEMA.SUPPLIER,
      PAYMENT_SUPPLY: schema.PARTNER_SCHEMA.PAYMENT_SUPPLY,
      SUPPLIER_ORDER_COST_LOG: schema.PARTNER_SCHEMA.SUPPLIER_ORDER_COST_LOG,
    },
  ],
  [
    "SUPPLIER_COST_SCHEMA",
    schema.SCHEMA_SUPPLIER_COST,
    { SUPPLIER_COST: schema.PARTNER_SCHEMA.SUPPLIER_COST },
  ],
  ["RENEW_ADOBE_SCHEMA", schema.SCHEMA_RENEW_ADOBE, schema.RENEW_ADOBE_SCHEMA],
  ["KEY_ACTIVE_SCHEMA", schema.SCHEMA_KEY_ACTIVE, schema.KEY_ACTIVE_SCHEMA],
  [
    "ORDERS_SCHEMA",
    schema.SCHEMA_ORDERS,
    {
      ORDER_LIST: schema.ORDERS_SCHEMA.ORDER_LIST,
      ORDER_CUSTOMER: schema.ORDERS_SCHEMA.ORDER_CUSTOMER,
    },
  ],
  [
    "RECEIPT_SCHEMA",
    schema.SCHEMA_RECEIPT,
    {
      PAYMENT_RECEIPT: schema.RECEIPT_SCHEMA.PAYMENT_RECEIPT,
      PAYMENT_RECEIPT_FINANCIAL_STATE:
        schema.RECEIPT_SCHEMA.PAYMENT_RECEIPT_FINANCIAL_STATE,
      PAYMENT_RECEIPT_FINANCIAL_AUDIT_LOG:
        schema.RECEIPT_SCHEMA.PAYMENT_RECEIPT_FINANCIAL_AUDIT_LOG,
      PAYMENT_RECEIPT_BATCH: schema.RECEIPT_SCHEMA.PAYMENT_RECEIPT_BATCH,
      PAYMENT_RECEIPT_BATCH_ITEM:
        schema.RECEIPT_SCHEMA.PAYMENT_RECEIPT_BATCH_ITEM,
      REFUND_CREDIT_NOTES: schema.RECEIPT_SCHEMA.REFUND_CREDIT_NOTES,
      REFUND_CREDIT_APPLICATIONS:
        schema.RECEIPT_SCHEMA.REFUND_CREDIT_APPLICATIONS,
    },
  ],
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL");
  }

  const pool = new Pool({ connectionString });
  const missing = [];
  let checkedTables = 0;
  let checkedColumns = 0;

  try {
    for (const [group, schemaName, map] of specs) {
      for (const [key, def] of Object.entries(map || {})) {
        if (!def?.TABLE) continue;
        checkedTables += 1;

        const tableResult = await pool.query(
          `
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = $1 AND table_name = $2
            ) AS ok
          `,
          [schemaName, def.TABLE]
        );

        if (!tableResult.rows[0].ok) {
          missing.push(`${group}.${key}: missing table ${schemaName}.${def.TABLE}`);
          continue;
        }

        const expectedColumns = Object.values(def.COLS || {}).filter(Boolean);
        checkedColumns += expectedColumns.length;
        const columnResult = await pool.query(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
          `,
          [schemaName, def.TABLE]
        );
        const actualColumns = new Set(
          columnResult.rows.map((row) => row.column_name)
        );

        for (const column of expectedColumns) {
          if (!actualColumns.has(column)) {
            missing.push(
              `${group}.${key}: missing column ${schemaName}.${def.TABLE}.${column}`
            );
          }
        }
      }
    }
  } finally {
    await pool.end();
  }

  const result = {
    checkedTables,
    checkedColumns,
    missingCount: missing.length,
    missing,
  };
  console.log(JSON.stringify(result, null, 2));

  if (missing.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
