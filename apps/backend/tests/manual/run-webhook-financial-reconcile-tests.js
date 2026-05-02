require("dotenv").config();

const crypto = require("crypto");
const request = require("supertest");
const { Pool } = require("pg");
const webhookApp = require("../../webhook/sepay/app");
const { reconcilePaymentReceipt } = require("../../src/controllers/PaymentsController");
const { STATUS } = require("../../src/utils/statuses");
const { db } = require("../../src/db");
const { updateDashboardMonthlySummaryOnStatusChange } = require("../../src/controllers/Order/finance/dashboardSummary");
const { runRenewal } = require("../../webhook/sepay/renewal");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_MONTH_KEY = "2099-12";
const TEST_PAYMENT_DATE = "2099-12-15";
const TEST_ORDER_DATE = "2099-12-01";
const TEST_EXPIRED_DATE = "2100-01-01";
const MARKER = `TEST-WEBHOOK-${Date.now()}`;
let nextOrderId = null;
let templateProductId = null;

const makeOrderCode = (suffix) =>
  `MAVC${Date.now().toString().slice(-7)}${suffix}`;

const qIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

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
  throw new Error("Thiếu SEPAY_API_KEY hoặc SEPAY_WEBHOOK_SECRET để chạy test webhook.");
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

async function getReceiptByOrderCode(orderCode) {
  const res = await pool.query(
    `
      SELECT id, id_order, payment_date, amount, note
      FROM receipt.payment_receipt
      WHERE LOWER(COALESCE(id_order, '')) = LOWER($1)
      ORDER BY id DESC
      LIMIT 1
    `,
    [orderCode]
  );
  return res.rows[0] || null;
}

async function getReceiptByMarkerAndEmptyOrder(marker) {
  const res = await pool.query(
    `
      SELECT id, id_order, payment_date, amount, note
      FROM receipt.payment_receipt
      WHERE COALESCE(id_order, '') = ''
        AND note ILIKE $1
      ORDER BY id DESC
      LIMIT 1
    `,
    [`%${marker}%`]
  );
  return res.rows[0] || null;
}

async function getReceiptState(receiptId) {
  const res = await pool.query(
    `
      SELECT payment_receipt_id, is_financial_posted, posted_revenue, posted_profit, reconciled_at, adjustment_applied
      FROM receipt.payment_receipt_financial_state
      WHERE payment_receipt_id = $1
      LIMIT 1
    `,
    [receiptId]
  );
  return res.rows[0] || null;
}

async function insertPostedReceiptState({ orderCode, amount, note }) {
  const receiptRes = await pool.query(
    `
      INSERT INTO receipt.payment_receipt (id_order, payment_date, amount, receiver, note, sender)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [orderCode, TEST_PAYMENT_DATE, amount, "918340998", note, "TEST"]
  );
  const receiptId = Number(receiptRes.rows[0]?.id || 0);
  await pool.query(
    `
      INSERT INTO receipt.payment_receipt_financial_state (
        payment_receipt_id,
        is_financial_posted,
        posted_revenue,
        posted_profit
      )
      VALUES ($1, TRUE, $2, $3)
      ON CONFLICT (payment_receipt_id)
      DO UPDATE SET
        is_financial_posted = TRUE,
        posted_revenue = EXCLUDED.posted_revenue,
        posted_profit = EXCLUDED.posted_profit,
        updated_at = NOW()
    `,
    [receiptId, amount, amount]
  );
  return receiptId;
}

async function createOrder({ idOrder, status, price, cost }) {
  if (!Number.isFinite(nextOrderId)) {
    throw new Error("nextOrderId chưa được khởi tạo.");
  }
  const manualId = nextOrderId++;
  if (!Number.isFinite(templateProductId)) {
    throw new Error("templateProductId chưa được khởi tạo.");
  }
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
    RETURNING id, id_order, status, price, cost, order_date
  `;
  const values = [
    manualId,
    idOrder,
    templateProductId,
    `${idOrder.toLowerCase()}@test.local`,
    `${MARKER}-CUSTOMER`,
    TEST_ORDER_DATE,
    TEST_EXPIRED_DATE,
    cost,
    price,
    `${MARKER} ORDER`,
    status,
  ];
  const res = await pool.query(sql, values);
  return res.rows[0];
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

async function callReconcile(receiptId, orderCode, action = "reconcile_only") {
  let statusCode = 200;
  let jsonPayload = null;
  const req = {
    params: { receiptId: String(receiptId) },
    body: { orderCode, action },
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
      return this;
    },
  };
  await reconcilePaymentReceipt(req, res);
  return { statusCode, body: jsonPayload };
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
      throw new Error(
        "Không tìm thấy id_product hợp lệ: cần product.variant hoặc đơn có id_product."
      );
    }
    templateProductId = Number(fromVariant.rows[0].id_product);
  } else {
    templateProductId = Number(templateProductRes.rows[0].id_product);
  }
  const maxOrderIdRes = await pool.query(
    "SELECT COALESCE(MAX(id), 0)::int AS max_id FROM orders.order_list"
  );
  nextOrderId = Number(maxOrderIdRes.rows[0]?.max_id || 0) + 1000;
  // Case 1: UNPAID with code -> old flow revenue/profit by order price/cost
  const c1OrderCode = makeOrderCode("A1");
  const c1Order = await createOrder({
    idOrder: c1OrderCode,
    status: STATUS.UNPAID,
    price: 100000,
    cost: 30000,
  });
  const c1Before = await getSummary(TEST_MONTH_KEY);
  const c1Payload = {
    transactionDate: `${TEST_PAYMENT_DATE} 09:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 100000,
    content: `${MARKER} NHAN TU TEST TRACE C1 ND ${c1OrderCode}`,
    description: `${MARKER} C1`,
  };
  const c1Res = await callWebhook(c1Payload);
  const c1After = await getSummary(TEST_MONTH_KEY);
  const c1Receipt = await getReceiptByOrderCode(c1OrderCode);
  const c1State = c1Receipt ? await getReceiptState(c1Receipt.id) : null;
  results.push({
    id: "C1",
    name: "Webhook co ma don UNPAID",
    ok:
      c1Res.status === 200 &&
      c1After.revenue - c1Before.revenue === 100000 &&
      c1After.profit - c1Before.profit === 70000 &&
      !!c1State?.is_financial_posted,
    detail: {
      httpStatus: c1Res.status,
      revenueDelta: c1After.revenue - c1Before.revenue,
      profitDelta: c1After.profit - c1Before.profit,
      state: c1State,
    },
  });

  const c7Before = await getSummary(TEST_MONTH_KEY);
  const c7Res = await callWebhook(c1Payload);
  const c7After = await getSummary(TEST_MONTH_KEY);
  results.push({
    id: "C7",
    name: "Duplicate webhook cung noi dung — khong cong doanh thu lan 2",
    ok:
      c7Res.status === 200 &&
      c7After.revenue === c7Before.revenue &&
      c7After.profit === c7Before.profit,
    detail: {
      httpStatus: c7Res.status,
      revenueDelta: c7After.revenue - c7Before.revenue,
      profitDelta: c7After.profit - c7Before.profit,
    },
  });

  // Case 2: PAID with prior receipt -> add revenue + profit (cùng số tiền biên lai bổ sung)
  const c2OrderCode = makeOrderCode("A2");
  await createOrder({
    idOrder: c2OrderCode,
    status: STATUS.PAID,
    price: 120000,
    cost: 40000,
  });
  await pool.query(
    `
      INSERT INTO receipt.payment_receipt (id_order, payment_date, amount, receiver, note, sender)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [c2OrderCode, TEST_PAYMENT_DATE, 50000, "918340998", `${MARKER} PRIOR`, "TEST"]
  );
  const c2Before = await getSummary(TEST_MONTH_KEY);
  const c2Payload = {
    transactionDate: `${TEST_PAYMENT_DATE} 10:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 250000,
    content: `${MARKER} NHAN TU TEST TRACE C2 ND ${c2OrderCode}`,
    description: `${MARKER} C2`,
  };
  const c2Res = await callWebhook(c2Payload);
  const c2After = await getSummary(TEST_MONTH_KEY);
  const c2Receipt = await getReceiptByOrderCode(c2OrderCode);
  const c2State = c2Receipt ? await getReceiptState(c2Receipt.id) : null;
  results.push({
    id: "C2",
    name: "Webhook co ma don PAID da co receipt truoc do",
    ok:
      c2Res.status === 200 &&
      c2After.revenue - c2Before.revenue === 250000 &&
      c2After.profit - c2Before.profit === 250000 &&
      !!c2State?.is_financial_posted,
    detail: {
      httpStatus: c2Res.status,
      revenueDelta: c2After.revenue - c2Before.revenue,
      profitDelta: c2After.profit - c2Before.profit,
      state: c2State,
    },
  });

  // Case 3: PAID without prior receipt -> no financial posting
  const c3OrderCode = makeOrderCode("A3");
  await createOrder({
    idOrder: c3OrderCode,
    status: STATUS.PAID,
    price: 110000,
    cost: 35000,
  });
  const c3Before = await getSummary(TEST_MONTH_KEY);
  const c3Payload = {
    transactionDate: `${TEST_PAYMENT_DATE} 11:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 260000,
    content: `${MARKER} NHAN TU TEST TRACE C3 ND ${c3OrderCode}`,
    description: `${MARKER} C3`,
  };
  const c3Res = await callWebhook(c3Payload);
  const c3After = await getSummary(TEST_MONTH_KEY);
  const c3Receipt = await getReceiptByOrderCode(c3OrderCode);
  const c3State = c3Receipt ? await getReceiptState(c3Receipt.id) : null;
  results.push({
    id: "C3",
    name: "Webhook co ma don PAID chua co receipt truoc do",
    ok:
      c3Res.status === 200 &&
      c3After.revenue - c3Before.revenue === 0 &&
      c3After.profit - c3Before.profit === 0 &&
      !c3State?.is_financial_posted,
    detail: {
      httpStatus: c3Res.status,
      revenueDelta: c3After.revenue - c3Before.revenue,
      profitDelta: c3After.profit - c3Before.profit,
      state: c3State,
    },
  });

  // Case 4: webhook no code -> straight revenue/profit
  const c4Before = await getSummary(TEST_MONTH_KEY);
  const c4Payload = {
    transactionDate: `${TEST_PAYMENT_DATE} 12:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 270000,
    content: `${MARKER} NHAN TU TEST TRACE C4 ND KHONG MA`,
    description: `${MARKER} C4`,
  };
  const c4Res = await callWebhook(c4Payload);
  const c4After = await getSummary(TEST_MONTH_KEY);
  const c4Receipt = await getReceiptByMarkerAndEmptyOrder(`${MARKER} C4`);
  const c4State = c4Receipt ? await getReceiptState(c4Receipt.id) : null;
  results.push({
    id: "C4",
    name: "Webhook khong ma don",
    ok:
      c4Res.status === 200 &&
      c4After.revenue - c4Before.revenue === 270000 &&
      c4After.profit - c4Before.profit === 270000 &&
      !!c4State?.is_financial_posted,
    detail: {
      httpStatus: c4Res.status,
      revenueDelta: c4After.revenue - c4Before.revenue,
      profitDelta: c4After.profit - c4Before.profit,
      state: c4State,
    },
  });

  // Case 5: reconcile receipt no-code -> PAID order (reverse temporary posting)
  const c5Before = await getSummary(TEST_MONTH_KEY);
  const c5Recon = await callReconcile(c4Receipt.id, c2OrderCode);
  const c5After = await getSummary(TEST_MONTH_KEY);
  const c5State = await getReceiptState(c4Receipt.id);
  results.push({
    id: "C5",
    name: "Reconcile receipt khong ma vao don PAID",
    ok:
      c5Recon.statusCode === 200 &&
      c5After.revenue - c5Before.revenue === -270000 &&
      c5After.profit - c5Before.profit === -270000 &&
      !!c5State?.adjustment_applied,
    detail: {
      httpStatus: c5Recon.statusCode,
      revenueDelta: c5After.revenue - c5Before.revenue,
      profitDelta: c5After.profit - c5Before.profit,
      state: c5State,
    },
  });

  // Case 6: reconcile receipt no-code -> UNPAID order (keep revenue, minus cost on profit)
  const c6OrderCode = makeOrderCode("A6");
  await createOrder({
    idOrder: c6OrderCode,
    status: STATUS.UNPAID,
    price: 130000,
    cost: 50000,
  });
  await callWebhook({
    transactionDate: `${TEST_PAYMENT_DATE} 13:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 280000,
    content: `${MARKER} NHAN TU TEST TRACE C6 ND KHONG MA`,
    description: `${MARKER} C6`,
  });
  const c6Receipt = await getReceiptByMarkerAndEmptyOrder(`${MARKER} C6`);
  const c6Before = await getSummary(TEST_MONTH_KEY);
  const c6Recon = await callReconcile(c6Receipt.id, c6OrderCode);
  const c6After = await getSummary(TEST_MONTH_KEY);
  const c6State = await getReceiptState(c6Receipt.id);
  results.push({
    id: "C6",
    name: "Reconcile receipt khong ma vao don UNPAID",
    ok:
      c6Recon.statusCode === 200 &&
      c6After.revenue - c6Before.revenue === 0 &&
      c6After.profit - c6Before.profit === -50000 &&
      !!c6State?.adjustment_applied,
    detail: {
      httpStatus: c6Recon.statusCode,
      revenueDelta: c6After.revenue - c6Before.revenue,
      profitDelta: c6After.profit - c6Before.profit,
      state: c6State,
    },
  });

  // Case 8: manual "Thanh Toan" after a posted receipt should not double-count dashboard
  const c8OrderCode = makeOrderCode("A8");
  const c8Order = await createOrder({
    idOrder: c8OrderCode,
    status: STATUS.UNPAID,
    price: 180000,
    cost: 60000,
  });
  await insertPostedReceiptState({
    orderCode: c8OrderCode,
    amount: 180000,
    note: `${MARKER} C8 MANUAL PAID`,
  });
  const c8Before = await getSummary(TEST_MONTH_KEY);
  await db.transaction(async (trx) => {
    const beforeRow = await trx("orders.order_list").where({ id: c8Order.id }).first();
    const [afterRow] = await trx("orders.order_list")
      .where({ id: c8Order.id })
      .update({ status: STATUS.PAID })
      .returning("*");
    await updateDashboardMonthlySummaryOnStatusChange(trx, beforeRow, afterRow);
  });
  const c8After = await getSummary(TEST_MONTH_KEY);
  results.push({
    id: "C8",
    name: "Manual Thanh Toan sau receipt da post khong double-count",
    ok:
      c8After.revenue - c8Before.revenue === 0 &&
      c8After.profit - c8Before.profit === 0,
    detail: {
      revenueDelta: c8After.revenue - c8Before.revenue,
      profitDelta: c8After.profit - c8Before.profit,
    },
  });

  // Case 9: manual "Gia Han" with posted receipt should not double-count dashboard
  const c9OrderCode = makeOrderCode("A9");
  await createOrder({
    idOrder: c9OrderCode,
    status: STATUS.RENEWAL,
    price: 190000,
    cost: 70000,
  });
  await insertPostedReceiptState({
    orderCode: c9OrderCode,
    amount: 190000,
    note: `${MARKER} C9 MANUAL RENEW`,
  });
  const c9Before = await getSummary(TEST_MONTH_KEY);
  const c9RenewResult = await runRenewal(c9OrderCode, {
    forceRenewal: true,
    source: "manual",
  });
  const c9After = await getSummary(TEST_MONTH_KEY);
  results.push({
    id: "C9",
    name: "Manual Gia Han sau receipt da post khong double-count",
    ok:
      !!c9RenewResult?.success &&
      c9After.revenue - c9Before.revenue === 0 &&
      c9After.profit - c9Before.profit === 0,
    detail: {
      renewalSuccess: !!c9RenewResult?.success,
      renewalDetails: c9RenewResult?.details || null,
      revenueDelta: c9After.revenue - c9Before.revenue,
      profitDelta: c9After.profit - c9Before.profit,
    },
  });

  // Case 10: reconcile + mark paid (UNPAID) -> run reconcile, then change status to PAID without double-count
  const c10OrderCode = makeOrderCode("B0");
  await createOrder({
    idOrder: c10OrderCode,
    status: STATUS.UNPAID,
    price: 210000,
    cost: 80000,
  });
  await callWebhook({
    transactionDate: `${TEST_PAYMENT_DATE} 14:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 300000,
    content: `${MARKER} NHAN TU TEST TRACE C10 ND KHONG MA`,
    description: `${MARKER} C10`,
  });
  const c10Receipt = await getReceiptByMarkerAndEmptyOrder(`${MARKER} C10`);
  const c10Before = await getSummary(TEST_MONTH_KEY);
  const c10Recon = await callReconcile(c10Receipt.id, c10OrderCode, "reconcile_and_mark_paid");
  const c10After = await getSummary(TEST_MONTH_KEY);
  const c10OrderRow = await pool.query(
    `SELECT status FROM orders.order_list WHERE LOWER(id_order) = LOWER($1) LIMIT 1`,
    [c10OrderCode]
  );
  results.push({
    id: "C10",
    name: "Reconcile + mark paid cho don UNPAID",
    ok:
      c10Recon.statusCode === 200 &&
      c10After.revenue - c10Before.revenue === 0 &&
      c10After.profit - c10Before.profit === -80000 &&
      String(c10OrderRow.rows?.[0]?.status || "") === STATUS.PAID,
    detail: {
      httpStatus: c10Recon.statusCode,
      revenueDelta: c10After.revenue - c10Before.revenue,
      profitDelta: c10After.profit - c10Before.profit,
      orderStatus: c10OrderRow.rows?.[0]?.status || null,
      actionResult: c10Recon.body?.actionResult || null,
    },
  });

  // Case 11: reconcile + renew (RENEWAL) -> run reconcile, trigger renewal without double-count
  const c11OrderCode = makeOrderCode("B1");
  await createOrder({
    idOrder: c11OrderCode,
    status: STATUS.RENEWAL,
    price: 220000,
    cost: 90000,
  });
  await callWebhook({
    transactionDate: `${TEST_PAYMENT_DATE} 15:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount: 320000,
    content: `${MARKER} NHAN TU TEST TRACE C11 ND KHONG MA`,
    description: `${MARKER} C11`,
  });
  const c11Receipt = await getReceiptByMarkerAndEmptyOrder(`${MARKER} C11`);
  const c11Before = await getSummary(TEST_MONTH_KEY);
  const c11Recon = await callReconcile(c11Receipt.id, c11OrderCode, "reconcile_and_renew");
  const c11After = await getSummary(TEST_MONTH_KEY);
  const c11OrderRow = await pool.query(
    `SELECT status FROM orders.order_list WHERE LOWER(id_order) = LOWER($1) LIMIT 1`,
    [c11OrderCode]
  );
  results.push({
    id: "C11",
    name: "Reconcile + renew cho don CAN GIA HAN",
    ok:
      c11Recon.statusCode === 200 &&
      !!c11Recon.body?.renewalSuccess &&
      c11After.revenue - c11Before.revenue === 0 &&
      c11After.profit - c11Before.profit === -90000 &&
      String(c11OrderRow.rows?.[0]?.status || "") === STATUS.PAID,
    detail: {
      httpStatus: c11Recon.statusCode,
      renewalSuccess: c11Recon.body?.renewalSuccess || false,
      revenueDelta: c11After.revenue - c11Before.revenue,
      profitDelta: c11After.profit - c11Before.profit,
      orderStatus: c11OrderRow.rows?.[0]?.status || null,
      actionResult: c11Recon.body?.actionResult || null,
    },
  });

  // Case 12: idempotent protect for mark_paid action (status no longer UNPAID)
  const c12Recon = await callReconcile(c10Receipt.id, c10OrderCode, "reconcile_and_mark_paid");
  results.push({
    id: "C12",
    name: "Idempotent mark paid action bi chan khi status da doi",
    ok: c12Recon.statusCode === 409,
    detail: {
      httpStatus: c12Recon.statusCode,
      error: c12Recon.body?.error || null,
    },
  });

  // Case 13: idempotent protect for renew action (status no longer RENEWAL)
  const c13Recon = await callReconcile(c11Receipt.id, c11OrderCode, "reconcile_and_renew");
  results.push({
    id: "C13",
    name: "Idempotent renew action bi chan khi status da doi",
    ok: c13Recon.statusCode === 409,
    detail: {
      httpStatus: c13Recon.statusCode,
      error: c13Recon.body?.error || null,
    },
  });

  return results;
}

async function cleanup() {
  await pool.query("DELETE FROM receipt.payment_receipt WHERE note ILIKE $1", [`%${MARKER}%`]);
  await pool.query("DELETE FROM orders.order_list WHERE note ILIKE $1 OR customer ILIKE $1", [`%${MARKER}%`]);
  await pool.query("DELETE FROM dashboard.dashboard_monthly_summary WHERE month_key = $1", [TEST_MONTH_KEY]);
}

(async () => {
  let results = [];
  let error = null;
  try {
    results = await run();
  } catch (err) {
    error = err;
  }

  try {
    await cleanup();
  } catch (cleanupErr) {
    if (!error) error = cleanupErr;
  } finally {
    await pool.end();
  }

  const output = {
    marker: MARKER,
    monthKey: TEST_MONTH_KEY,
    success: !error && results.every((r) => r.ok),
    results,
    error: error ? { message: error.message, stack: error.stack } : null,
  };
  console.log(JSON.stringify(output, null, 2));
  if (error || results.some((r) => !r.ok)) {
    process.exit(1);
  }
})();
