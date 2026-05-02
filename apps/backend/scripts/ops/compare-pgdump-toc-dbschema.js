/**
 * So sánh TOC bảng trong backup pg_dump (custom format) với các bảng khai báo trong dbSchema
 * (cùng phạm vi verify-db-schema-config.js). Không đọc cột từ dump — chỉ tồn tại schema.table.
 *
 *   node scripts/ops/compare-pgdump-toc-dbschema.js "D:/path/to/backup.dump"
 *
 * Biến môi trường: PG_RESTORE (đường dẫn pg_restore.exe).
 */
const fs = require("fs");
const { execFileSync } = require("child_process");
const schema = require("../../src/config/dbSchema");

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

function resolvePgRestore() {
  if (process.env.PG_RESTORE && fs.existsSync(process.env.PG_RESTORE)) {
    return process.env.PG_RESTORE;
  }
  const wins = ["18", "16", "17", "15"].map(
    (v) =>
      `C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_restore.exe`
  );
  for (const p of wins) {
    if (fs.existsSync(p)) return p;
  }
  return "pg_restore";
}

function tableSetFromToc(dumpPath, pgRestore) {
  let out;
  try {
    out = execFileSync(pgRestore, ["-l", dumpPath], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (e) {
    e.message += ` (pg_restore: ${pgRestore})`;
    throw e;
  }
  const set = new Set();
  for (const line of out.split("\n")) {
    const m = line.match(
      /^\d+;\s+\d+\s+\d+\s+TABLE\s+(\S+)\s+(\S+)\s+\S+\s*$/
    );
    if (m) set.add(`${m[1]}.${m[2]}`);
  }
  return set;
}

function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath || !fs.existsSync(dumpPath)) {
    console.error(
      "Usage: node compare-pgdump-toc-dbschema.js <path-to-.dump>\n" +
        "File không tồn tại hoặc thiếu tham số."
    );
    process.exit(1);
  }

  const pgRestore = resolvePgRestore();
  const tocTables = tableSetFromToc(dumpPath, pgRestore);

  const expected = [];
  const missingInDump = [];
  for (const [group, schemaName, map] of specs) {
    for (const [key, def] of Object.entries(map || {})) {
      if (!def?.TABLE) continue;
      const fq = `${schemaName}.${def.TABLE}`;
      expected.push({ group, key, fq });
      if (!tocTables.has(fq)) {
        missingInDump.push(`${group}.${key}: ${fq} not in dump TOC`);
      }
    }
  }

  const verifyFq = new Set(expected.map((e) => e.fq));
  const extraInDumpSameSchemas = [...tocTables].filter((t) => {
    const [sch] = t.split(".");
    return specs.some(([, s]) => s === sch) && !verifyFq.has(t);
  });

  const result = {
    dumpPath,
    pgRestore,
    tocTableCount: tocTables.size,
    dbSchemaVerifyTableCount: expected.length,
    missingInDump,
    note:
      "Dump có thêm nhiều bảng (cart, audit, …) ngoài phạm vi Automation dbSchema — chỉ liệt kê bảng thuộc schema mà dbSchema cũng dùng nhưng không nằm trong verify specs.",
    extraTablesInDumpForVerifySchemas: extraInDumpSameSchemas.sort(),
  };
  console.log(JSON.stringify(result, null, 2));

  if (missingInDump.length) process.exitCode = 1;
}

main();
