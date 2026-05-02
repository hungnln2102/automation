/**
 * 3 kịch bản nghiệp vụ + 3 mục Validation (mục 3 ke-hoach-cleanup-rule-he-thong.md).
 *
 * Chạy từ thư mục backend, cần DATABASE_URL + SEPAY_API_KEY hoặc SEPAY_WEBHOOK_SECRET.
 *
 * Tắt Telegram renewal trong phiên test để processRenewalTask không fail sau runRenewal.
 *
 *   node tests/manual/run-scenario-webhook-validation-suite.js
 */

require("dotenv").config();
process.env.SEND_RENEWAL_TO_TOPIC = "false";
process.env.TELEGRAM_BOT_TOKEN = "";

const crypto = require("crypto");
const request = require("supertest");
const { Pool } = require("pg");
const webhookApp = require("../../webhook/sepay/app");
const { STATUS } = require("../../src/utils/statuses");
const { TABLES } = require("../../src/controllers/Order/constants");
const { ORDERS_SCHEMA } = require("../../src/config/dbSchema");
const { normalizeOrderRow } = require("../../src/controllers/Order/helpers");
const { todayYMDInVietnam } = require("../../src/utils/normalizers");
const { deleteOrderWithArchive } = require("../../src/controllers/Order/orderDeletionService");
const { completeProcessingOrderWithManualWebhook } = require("../../src/controllers/Order/manualWebhookCompletion");
const { insertPaymentReceipt } = require("../../webhook/sepay/payments");
const { parseFlexibleDate } = require("../../webhook/sepay/utils");
const { db } = require("../../src/db");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Cùng cách ghi tháng với manualWebhookCompletion (paidMonthKey). */
const monthKeyFromManualNow = () => {
  const d = parseFlexibleDate(new Date().toISOString());
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const FUTURE_MONTH_KEY = "2099-12";
const FUTURE_PAYMENT_DATE = "2099-12-15";
const FUTURE_ORDER_DATE = "2099-12-01";
const FUTURE_EXPIRED_FAR = "2100-01-01";
const MARKER = `SCEN-VAL-${Date.now()}`;

let templateProductId = null;
let nextOrderId = null;

const makeOrderCode = (suffix) =>
  `MAVC${Date.now().toString().slice(-6)}${suffix}`;

function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildAuth(payloadString) {
  if (process.env.SEPAY_API_KEY) {
    return { Authorization: `Apikey ${process.env.SEPAY_API_KEY}` };
  }
  if (process.env.SEPAY_WEBHOOK_SECRET) {
    const sig = crypto
      .createHmac("sha256", process.env.SEPAY_WEBHOOK_SECRET)
      .update(Buffer.from(payloadString))
      .digest("hex");
    return { "X-SEPAY-SIGNATURE": sig };
  }
  throw new Error("Thiếu SEPAY_API_KEY hoặc SEPAY_WEBHOOK_SECRET.");
}

async function getSummary(monthKey) {
  const res = await pool.query(
    `
      SELECT
        COALESCE(total_revenue::numeric, 0) AS total_revenue,
        COALESCE(total_profit::numeric, 0) AS total_profit
      FROM dashboard.dashboard_monthly_summary
      WHERE month_key = $1
      LIMIT 1
    `,
    [monthKey]
  );
  if (!res.rows.length) return { revenue: 0, profit: 0 };
  return {
    revenue: Number(res.rows[0].total_revenue) || 0,
    profit: Number(res.rows[0].total_profit) || 0,
  };
}

async function callWebhook(payload) {
  const body = JSON.stringify(payload);
  const headers = buildAuth(body);
  let req = request(webhookApp)
    .post("/api/payment/notify")
    .set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(headers)) {
    req = req.set(k, v);
  }
  return req.send(body);
}

async function createOrder({ idOrder, status, price, cost, orderDate, expiredAt, idProduct }) {
  if (!Number.isFinite(nextOrderId)) throw new Error("nextOrderId unset");
  if (!Number.isFinite(templateProductId)) throw new Error("templateProductId unset");
  const pid = Number.isFinite(Number(idProduct)) ? Number(idProduct) : templateProductId;
  const manualId = nextOrderId++;
  const sql = `
    INSERT INTO orders.order_list (
      id,
      id_order,
      id_product,
      information_order,
      customer,
      contact,
      slot,
      order_date,
      days,
      expired_at,
      supply_id,
      cost,
      price,
      note,
      status,
      refund
    )
    VALUES (
      $1, $2, $3, $4, $5, '0000000000', '1',
      $6, '30', $7, NULL, $8, $9, $10, $11, 0
    )
    RETURNING id, id_order, status, price, cost, order_date, expired_at
  `;
  const values = [
    manualId,
    idOrder,
    pid,
    `${String(idOrder).toLowerCase()}@test.local`,
    `${MARKER}-CUSTOMER`,
    orderDate || FUTURE_ORDER_DATE,
    expiredAt || FUTURE_EXPIRED_FAR,
    cost,
    price,
    `${MARKER} ${idOrder}`,
    status,
  ];
  const res = await pool.query(sql, values);
  return res.rows[0];
}

async function cleanup(monthlyReverses) {
  const like = `%${MARKER}%`;
  const merged = new Map();
  for (const r of monthlyReverses || []) {
    if (!r?.monthKey) continue;
    const prev = merged.get(r.monthKey) || { rev: 0, prof: 0 };
    merged.set(r.monthKey, {
      rev: prev.rev + (Number(r.rev) || 0),
      prof: prev.prof + (Number(r.prof) || 0),
    });
  }
  for (const [monthKey, d] of merged) {
    if (!d.rev && !d.prof) continue;
    await pool.query(
      `
        UPDATE dashboard.dashboard_monthly_summary
        SET total_revenue = total_revenue - $1::numeric,
            total_profit = total_profit - $2::numeric,
            updated_at = NOW()
        WHERE month_key = $3
      `,
      [d.rev, d.prof, monthKey]
    );
  }

  await pool.query(
    `
      DELETE FROM receipt.refund_credit_applications
      WHERE credit_note_id IN (
        SELECT id FROM receipt.refund_credit_notes
        WHERE source_order_list_id IN (
          SELECT id FROM orders.order_list WHERE customer ILIKE $1 OR note ILIKE $1
        )
      )
    `,
    [like]
  );
  await pool.query(
    `
      DELETE FROM receipt.refund_credit_notes
      WHERE source_order_list_id IN (
        SELECT id FROM orders.order_list WHERE customer ILIKE $1 OR note ILIKE $1
      )
    `,
    [like]
  );
  await pool.query(
    `DELETE FROM receipt.payment_receipt_financial_audit_log
     WHERE payment_receipt_id IN (
       SELECT id FROM receipt.payment_receipt WHERE note ILIKE $1
     )`,
    [like]
  );
  await pool.query(
    `DELETE FROM receipt.payment_receipt_financial_state
     WHERE payment_receipt_id IN (
       SELECT id FROM receipt.payment_receipt WHERE note ILIKE $1
     )`,
    [like]
  );
  await pool.query(`DELETE FROM receipt.payment_receipt WHERE note ILIKE $1`, [like]);
  await pool.query(
    `DELETE FROM orders.order_list WHERE customer ILIKE $1 OR note ILIKE $1`,
    [like]
  );
  await pool.query(`DELETE FROM dashboard.dashboard_monthly_summary WHERE month_key = $1`, [
    FUTURE_MONTH_KEY,
  ]);
}

async function run() {
  const results = [];

  const templateProductRes = await pool.query(
    "SELECT id_product FROM orders.order_list WHERE id_product IS NOT NULL ORDER BY id DESC LIMIT 1"
  );
  if (!templateProductRes.rows.length) {
    const fromVariant = await pool.query(
      "SELECT id AS id_product FROM product.variant ORDER BY id ASC LIMIT 1"
    );
    if (!fromVariant.rows.length) {
      throw new Error("Không có id_product: cần product.variant hoặc đơn có id_product.");
    }
    templateProductId = Number(fromVariant.rows[0].id_product);
  } else {
    templateProductId = Number(templateProductRes.rows[0].id_product);
  }

  const renewalVariantRes = await pool.query(
    `
      SELECT id AS id_product
      FROM product.variant
      WHERE display_name::text ~ '--[0-9]+[mMyY]'
      ORDER BY id ASC
      LIMIT 1
    `
  );
  const renewalTemplateProductId = renewalVariantRes.rows[0]?.id_product
    ? Number(renewalVariantRes.rows[0].id_product)
    : templateProductId;
  const maxOrderIdRes = await pool.query(
    "SELECT COALESCE(MAX(id), 0)::int AS max_id FROM orders.order_list"
  );
  nextOrderId = Number(maxOrderIdRes.rows[0]?.max_id || 0) + 2000;

  const monthlyReverses = [];
  // --- S1: Tự tạo đơn (UNPAID) → giả lập webhook Sepay ---
  const s1Code = makeOrderCode("S1");
  await createOrder({
    idOrder: s1Code,
    status: STATUS.UNPAID,
    price: 100000,
    cost: 30000,
  });
  const s1Before = await getSummary(FUTURE_MONTH_KEY);
  const s1Payload = {
    transactionDate: `${FUTURE_PAYMENT_DATE} 09:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 100000,
    id: `SE-${MARKER}-S1`,
    content: `${MARKER} ND ${s1Code}`,
    description: `${MARKER} S1`,
  };
  const s1Http = await callWebhook(s1Payload);
  const s1After = await getSummary(FUTURE_MONTH_KEY);
  const s1Row = await pool.query(
    `SELECT status FROM orders.order_list WHERE LOWER(id_order) = LOWER($1)`,
    [s1Code]
  );
  results.push({
    id: "S1",
    name: "Tạo đơn UNPAID → webhook Sepay → Đã TT + cộng DT/LN",
    ok:
      s1Http.status === 200 &&
      s1After.revenue - s1Before.revenue === 100000 &&
      s1After.profit - s1Before.profit === 70000 &&
      String(s1Row.rows[0]?.status || "") === STATUS.PAID,
  });

  // --- S2: Cần Gia Hạn + expiry ≤4 ngày → webhook Sepay → gia hạn ---
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const nearExpiry = new Date(today);
  nearExpiry.setDate(nearExpiry.getDate() + 2);
  const renewOrderDate = new Date(today);
  renewOrderDate.setDate(renewOrderDate.getDate() - 25);
  const s2Code = makeOrderCode("S2");
  const renewMonthKey = ymd(today).slice(0, 7);
  await createOrder({
    idOrder: s2Code,
    status: STATUS.RENEWAL,
    price: 250000,
    cost: 90000,
    orderDate: ymd(renewOrderDate),
    expiredAt: ymd(nearExpiry),
    idProduct: renewalTemplateProductId,
  });
  const s2Before = await getSummary(renewMonthKey);
  const s2Paid = `${ymd(today)} 11:00:00`;
  const s2Payload = {
    transactionDate: s2Paid,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 250000,
    id: `SE-${MARKER}-S2`,
    content: `${MARKER} GIA HAN ${s2Code}`,
    description: `${MARKER} S2`,
  };
  const s2Http = await callWebhook(s2Payload);
  const s2After = await getSummary(renewMonthKey);
  const s2Order = await pool.query(
    `SELECT status, expired_at::text AS ex FROM orders.order_list WHERE LOWER(id_order) = LOWER($1)`,
    [s2Code]
  );
  const s2ExAfter = String(s2Order.rows[0]?.ex || "").slice(0, 10);
  const nearExpiryYmd = ymd(nearExpiry);
  const renewedDateMoved = s2ExAfter > nearExpiryYmd;
  monthlyReverses.push({
    monthKey: renewMonthKey,
    rev: s2After.revenue - s2Before.revenue,
    prof: s2After.profit - s2Before.profit,
  });

  results.push({
    id: "S2",
    name: "Đơn Cần Gia Hạn (QR được phép) → webhook → gia hạn + posting",
    ok:
      s2Http.status === 200 &&
      s2After.revenue > s2Before.revenue &&
      String(s2Order.rows[0]?.status || "") === STATUS.PAID &&
      renewedDateMoved,
    renewalDelta: {
      monthKey: renewMonthKey,
      rev: s2After.revenue - s2Before.revenue,
      prof: s2After.profit - s2Before.profit,
    },
  });

  // --- S3: Xóa đơn PAID → Chưa Hoàn ---
  const s3Code = makeOrderCode("S3");
  const s3Order = await createOrder({
    idOrder: s3Code,
    status: STATUS.PAID,
    price: 195000,
    cost: 55000,
  });
  const trx = await db.transaction();
  try {
    const order = await trx(TABLES.orderList).where({ id: s3Order.id }).first();
    if (!order) throw new Error("S3: missing order");
    const normalized = normalizeOrderRow(order, todayYMDInVietnam());
    await deleteOrderWithArchive({
      trx,
      order,
      normalized,
      reqBody: {},
      helpers: {
        TABLES,
        ORDERS_SCHEMA,
        STATUS,
      },
    });
  } catch (e) {
    try {
      await trx.rollback();
    } catch (_) {}
    throw e;
  }
  const s3AfterDel = await pool.query(
    `SELECT status, refund FROM orders.order_list WHERE id = $1`,
    [s3Order.id]
  );
  const statusCol = String(s3AfterDel.rows[0]?.status || "");
  const refundNum = Number(s3AfterDel.rows[0]?.refund) || 0;
  results.push({
    id: "S3",
    name: "Xóa đơn PAID → trạng thái Chưa Hoàn + refund > 0",
    ok: statusCol === STATUS.PENDING_REFUND && refundNum > 0,
  });

  // --- V1: Chỉ insert receipt (không post finance) → summary (tháng biên lai) không đổi ---
  const v1Code = makeOrderCode("V1");
  await createOrder({
    idOrder: v1Code,
    status: STATUS.UNPAID,
    price: 80000,
    cost: 20000,
  });
  const v1Before = await getSummary(FUTURE_MONTH_KEY);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await insertPaymentReceipt(
      {
        transaction_id: `TXN-${MARKER}-V1`,
        transaction_date: `${FUTURE_PAYMENT_DATE} 12:00:00`,
        transfer_amount: 80000,
        account_number: "918340998",
        transfer_type: "in",
        note: `${MARKER} V1 insert-only`,
        description: `${MARKER} V1`,
      },
      { client, orderCode: v1Code }
    );
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
  const v1After = await getSummary(FUTURE_MONTH_KEY);
  results.push({
    id: "V1",
    name: "Validation: insert receipt không tự cộng dashboard_monthly_summary",
    ok: v1Before.revenue === v1After.revenue && v1Before.profit === v1After.profit,
  });

  // --- V2: Manual webhook hoàn thành PROCESSING → chỉ một lần cộng ---
  const v2Code = makeOrderCode("V2");
  const v2Order = await createOrder({
    idOrder: v2Code,
    status: STATUS.PROCESSING,
    price: 165000,
    cost: 55000,
  });
  const v2Month = monthKeyFromManualNow();
  if (!v2Month) throw new Error("V2: cannot derive month key");
  const v2b0 = await getSummary(v2Month);
  const r1 = await completeProcessingOrderWithManualWebhook(v2Order.id);
  const v2b1 = await getSummary(v2Month);
  const r2 = await completeProcessingOrderWithManualWebhook(v2Order.id);
  const v2b2 = await getSummary(v2Month);
  const v2RevDeltaOnce = v2b1.revenue - v2b0.revenue;
  const v2ProfDeltaOnce = v2b1.profit - v2b0.profit;
  monthlyReverses.push({
    monthKey: v2Month,
    rev: v2RevDeltaOnce,
    prof: v2ProfDeltaOnce,
  });
  results.push({
    id: "V2",
    name: "Validation: manual webhook chỉ cộng DT/LN một lần",
    ok:
      r1.status === 200 &&
      r2.status === 409 &&
      v2RevDeltaOnce === 165000 &&
      v2ProfDeltaOnce === 55000 &&
      v2b2.revenue === v2b1.revenue &&
      v2b2.profit === v2b1.profit,
  });

  // --- V3: Webhook Sepay PROCESSING → PAID: không double khi gửi trùng ---
  const v3Code = makeOrderCode("V3");
  await createOrder({
    idOrder: v3Code,
    status: STATUS.PROCESSING,
    price: 140000,
    cost: 40000,
  });
  const v3Month = FUTURE_MONTH_KEY;
  const v3Payload = {
    transactionDate: `${FUTURE_PAYMENT_DATE} 16:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 140000,
    id: `SE-${MARKER}-V3-DEDUP`,
    content: `${MARKER} ND ${v3Code}`,
    description: `${MARKER} V3`,
  };
  const v3a = await getSummary(v3Month);
  const v3h1 = await callWebhook(v3Payload);
  const v3b = await getSummary(v3Month);
  const v3h2 = await callWebhook(v3Payload);
  const v3c = await getSummary(v3Month);
  monthlyReverses.push({
    monthKey: v3Month,
    rev: v3b.revenue - v3a.revenue,
    prof: v3b.profit - v3a.profit,
  });
  results.push({
    id: "V3",
    name: "Validation: webhook Sepay PROCESSING→PAID không cộng trùng",
    ok:
      v3h1.status === 200 &&
      v3h2.status === 200 &&
      v3b.revenue - v3a.revenue === 140000 &&
      v3b.profit - v3a.profit === 100000 &&
      v3c.revenue === v3b.revenue &&
      v3c.profit === v3b.profit,
  });

  return { results, monthlyReverses };
}

(async () => {
  let payload = {
    marker: MARKER,
    success: false,
    results: [],
    monthlyReverses: [],
    error: null,
  };
  try {
    const { results, monthlyReverses } = await run();
    const success = results.every((r) => r.ok);
    payload = {
      marker: MARKER,
      success,
      results: results.map(({ renewalDelta: _rd, ...rest }) => rest),
      monthlyReverses,
      error: null,
    };
    console.log(JSON.stringify(payload, null, 2));
  } catch (err) {
    payload.error = { message: err.message, stack: err.stack };
    console.log(JSON.stringify(payload, null, 2));
  }

  try {
    await cleanup(payload.monthlyReverses || []);
  } catch (cleanupErr) {
    if (!payload.error) payload.cleanupError = cleanupErr.message;
  } finally {
    await pool.end();
    try {
      await db.destroy();
    } catch (_) {}
  }

  if (payload.error || !payload.success) {
    process.exit(1);
  }
})();
