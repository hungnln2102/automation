/**
 * Tùy chọn: tạo một dòng audit tổng hợp từ payment_receipt_financial_state
 * cho biên lai đã có posted_* nhưng chưa có dòng nào trong payment_receipt_financial_audit_log.
 * Chạy sau khi deploy bảng audit (066). Không ghi đè dữ liệu đã có audit.
 *
 *   node backend/scripts/ops/backfill-financial-audit-from-state.js
 */

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query(`
    INSERT INTO receipt.payment_receipt_financial_audit_log (
      payment_receipt_id,
      order_code,
      rule_branch,
      delta,
      source
    )
    SELECT
      fs.payment_receipt_id,
      COALESCE(TRIM(pr.id_order::text), ''),
      'BACKFILL_FROM_STATE',
      jsonb_build_object(
        'posted_revenue', fs.posted_revenue,
        'posted_profit', fs.posted_profit,
        'is_financial_posted', fs.is_financial_posted,
        'note', 'synthetic row from existing financial_state'
      ),
      'backfill'
    FROM receipt.payment_receipt_financial_state fs
    INNER JOIN receipt.payment_receipt pr ON pr.id = fs.payment_receipt_id
    WHERE (
      COALESCE(fs.posted_revenue, 0) <> 0
      OR COALESCE(fs.posted_profit, 0) <> 0
      OR fs.is_financial_posted = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM receipt.payment_receipt_financial_audit_log a
      WHERE a.payment_receipt_id = fs.payment_receipt_id
    )
    RETURNING payment_receipt_id
  `);
  console.log(`Inserted ${res.rowCount} backfill audit row(s).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
