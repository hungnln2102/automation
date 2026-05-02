/**
 * Kịch bản lợi nhuận / webhook / hoàn thành thủ công (theo spec nghiệp vụ).
 * Chạy: cd backend && npm run test:webhook-profit
 *    hoặc: node tests/manual/run-webhook-profit-scenarios-tests.js
 * Cần: DATABASE_URL, SEPAY_API_KEY hoặc SEPAY_WEBHOOK_SECRET
 *
 * P2: hai webhook (tổng = giá − 5k) — sau webhook 1 bảng dashboard_monthly_summary
 *     phải cộng doanh thu và lợi nhuận (đúng bằng tiền lần 1, chưa trừ cost).
 * P6/P7: webhook 1 < giá; webhook 2 = 2× hoặc 3× giá — `total_import` chỉ tăng `cost` một lần.
 */
require("dotenv").config();

const crypto = require("crypto");
const request = require("supertest");
const { Pool } = require("pg");
const webhookApp = require("../../webhook/sepay/app");
const { STATUS } = require("../../src/utils/statuses");
const {
  completeProcessingOrderWithManualWebhook,
} = require("../../src/controllers/Order/manualWebhookCompletion");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_MONTH_KEY = "2099-11";
const TEST_PAYMENT_DATE = "2099-11-20";
const TEST_ORDER_DATE = "2099-11-01";
const TEST_EXPIRED_DATE = "2100-01-01";
const MARKER = `TEST-PROFIT-SC-${Date.now()}`;

let nextOrderId = null;
let templateProductId = null;
let templateSupplyId = null;

const PRICE = 200_000;
const COST = 70_000;

const makeOrderCode = (suffix) =>
  `MAVC${Date.now().toString().slice(-7)}${suffix}`;

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
        COALESCE(total_profit::numeric, 0) AS total_profit,
        COALESCE(total_import::numeric, 0) AS total_import
      FROM dashboard.dashboard_monthly_summary
      WHERE month_key = $1
      LIMIT 1
    `,
    [monthKey]
  );
  if (!res.rows.length) return { revenue: 0, profit: 0, importVal: 0 };
  return {
    revenue: Number(res.rows[0].total_revenue) || 0,
    profit: Number(res.rows[0].total_profit) || 0,
    importVal: Number(res.rows[0].total_import) || 0,
  };
}

async function getOrderStatus(orderCode) {
  const res = await pool.query(
    `SELECT status FROM orders.order_list WHERE LOWER(id_order) = LOWER($1) LIMIT 1`,
    [orderCode]
  );
  return String(res.rows[0]?.status || "");
}

async function createOrder({ idOrder, status }) {
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
      $6, '30', $7, $8, $9, $10, $11, $12, 0
    )
    RETURNING id, id_order, status, price, cost
  `;
  const values = [
    manualId,
    idOrder,
    templateProductId,
    `${idOrder.toLowerCase()}@test.local`,
    `${MARKER}-CUSTOMER`,
    TEST_ORDER_DATE,
    TEST_EXPIRED_DATE,
    templateSupplyId,
    COST,
    PRICE,
    `${MARKER} ORDER`,
    status,
  ];
  const res = await pool.query(sql, values);
  return res.rows[0];
}

function buildWebhookPayload(
  uniqueId,
  traceSuffix,
  transferAmount,
  orderCode,
  paymentDateYmd = TEST_PAYMENT_DATE
) {
  return {
    id: `SE-${MARKER}-${uniqueId}`,
    transactionDate: `${paymentDateYmd} 10:00:00`,
    accountNumber: "918340998",
    transferType: "in",
    transferAmount,
    content: `${MARKER} NHAN TU TEST TRACE ${traceSuffix} ND ${orderCode}`,
    description: `${MARKER} ${traceSuffix}`,
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

/** NCC thật (không mavryk/shop) — giống production, trigger ghi `supplier_order_cost_log`. */
async function resolveTemplateSupplyId() {
  const r = await pool.query(
    `
      SELECT id
      FROM partner.supplier
      WHERE LOWER(TRIM(COALESCE(supplier_name, ''))) NOT IN ('mavryk', 'shop')
      ORDER BY id ASC
      LIMIT 1
    `
  );
  if (!r.rows.length) {
    throw new Error(
      "Không có partner.supplier phù hợp: cần ít nhất một NCC không phải tên mavryk hoặc shop."
    );
  }
  return Number(r.rows[0].id);
}

/** `id_product` FK → product.variant.id — ưu tiên đơn cũ, không có thì lấy variant bất kỳ. */
async function resolveTemplateProductId() {
  const fromOrders = await pool.query(
    `SELECT id_product FROM orders.order_list
     WHERE id_product IS NOT NULL ORDER BY id DESC LIMIT 1`
  );
  if (fromOrders.rows.length) {
    return Number(fromOrders.rows[0].id_product);
  }
  const fromVariant = await pool.query(
    `SELECT id FROM product.variant ORDER BY id ASC LIMIT 1`
  );
  if (fromVariant.rows.length) {
    return Number(fromVariant.rows[0].id);
  }
  throw new Error(
    "Không tìm thấy id_product: cần ít nhất một dòng product.variant hoặc đơn có id_product."
  );
}

async function run() {
  const results = [];

  /** Cùng tháng lịch VN với `supplier_order_cost_log.logged_at` DEFAULT now() (test máy chạy “hôm nay”). */
  const paymentDateLiveVN = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const monthKeyLiveVN = paymentDateLiveVN.slice(0, 7);

  templateProductId = await resolveTemplateProductId();
  templateSupplyId = await resolveTemplateSupplyId();
  const maxOrderIdRes = await pool.query(
    "SELECT COALESCE(MAX(id), 0)::int AS max_id FROM orders.order_list"
  );
  nextOrderId = Number(maxOrderIdRes.rows[0]?.max_id || 0) + 5000;

  const requiredMin = Math.max(0, PRICE - 5000);

  // P1: một webhook đúng giá bán
  {
    const code = makeOrderCode("P1");
    await createOrder({ idOrder: code, status: STATUS.UNPAID });
    const before = await getSummary(TEST_MONTH_KEY);
    const res = await callWebhook(buildWebhookPayload("P1a", "P1A", PRICE, code));
    const after = await getSummary(TEST_MONTH_KEY);
    const st = await getOrderStatus(code);
    const recv = PRICE;
    const expProfit = recv - COST;
    results.push({
      id: "P1",
      name: "1 webhook = giá bán → Đã TT; LN = tiền nhận − giá nhập",
      ok:
        res.status === 200 &&
        st === STATUS.PAID &&
        after.revenue - before.revenue === recv &&
        after.profit - before.profit === expProfit,
      detail: {
        httpStatus: res.status,
        status: st,
        revenueDelta: after.revenue - before.revenue,
        profitDelta: after.profit - before.profit,
        expectRevenue: recv,
        expectProfit: expProfit,
      },
    });
  }

  // P2: hai webhook, cộng lại = giá − 5k (đủ requiredMin)
  {
    const code = makeOrderCode("P2");
    await createOrder({ idOrder: code, status: STATUS.UNPAID });
    const before = await getSummary(TEST_MONTH_KEY);
    const w1 = 100_000;
    const w2 = requiredMin - w1;
    const r1 = await callWebhook(buildWebhookPayload("P2a", "P2A", w1, code));
    const afterFirst = await getSummary(TEST_MONTH_KEY);
    const mid = await getOrderStatus(code);
    const r2 = await callWebhook(buildWebhookPayload("P2b", "P2B", w2, code));
    const after = await getSummary(TEST_MONTH_KEY);
    const st = await getOrderStatus(code);
    const recv = w1 + w2;
    const expProfit = recv - COST;
    const deltaRevAfterFirst = afterFirst.revenue - before.revenue;
    const deltaProfAfterFirst = afterFirst.profit - before.profit;
    results.push({
      id: "P2",
      name: "2 webhook thiếu trong 5k (tổng = giá−5k) → sau webhook 1 đã cộng DT/LN; webhook 2 → Đã TT",
      ok:
        r1.status === 200 &&
        r2.status === 200 &&
        mid === STATUS.UNPAID &&
        st === STATUS.PAID &&
        deltaRevAfterFirst === w1 &&
        deltaProfAfterFirst === w1 &&
        after.revenue - before.revenue === recv &&
        after.profit - before.profit === expProfit,
      detail: {
        afterFirstStatus: mid,
        deltaRevenueAfterFirstWebhook: deltaRevAfterFirst,
        deltaProfitAfterFirstWebhook: deltaProfAfterFirst,
        expectDeltaAfterFirst: w1,
        status: st,
        revenueDelta: after.revenue - before.revenue,
        profitDelta: after.profit - before.profit,
        expectRevenue: recv,
        expectProfit: expProfit,
      },
    });
  }

  // P3: hai webhook, tổng = giá + 5k
  {
    const code = makeOrderCode("P3");
    await createOrder({ idOrder: code, status: STATUS.UNPAID });
    const before = await getSummary(TEST_MONTH_KEY);
    const w1 = 100_000;
    const w2 = PRICE + 5_000 - w1;
    const r1 = await callWebhook(buildWebhookPayload("P3a", "P3A", w1, code));
    const r2 = await callWebhook(buildWebhookPayload("P3b", "P3B", w2, code));
    const after = await getSummary(TEST_MONTH_KEY);
    const st = await getOrderStatus(code);
    const recv = w1 + w2;
    const expProfit = recv - COST;
    results.push({
      id: "P3",
      name: "2 webhook thừa 5k → Đã TT; LN = tiền nhận − giá nhập",
      ok:
        r1.status === 200 &&
        r2.status === 200 &&
        st === STATUS.PAID &&
        after.revenue - before.revenue === recv &&
        after.profit - before.profit === expProfit,
      detail: {
        status: st,
        revenueDelta: after.revenue - before.revenue,
        profitDelta: after.profit - before.profit,
        expectRevenue: recv,
        expectProfit: expProfit,
      },
    });
  }

  // P4: ba webhook; hai đầu đủ giá; webhook 3 cộng DT + LN thẳng
  {
    const code = makeOrderCode("P4");
    await createOrder({ idOrder: code, status: STATUS.UNPAID });
    const before = await getSummary(TEST_MONTH_KEY);
    const w1 = 100_000;
    const w2 = 100_000;
    const w3 = 30_000;
    const r1 = await callWebhook(buildWebhookPayload("P4a", "P4A", w1, code));
    const r2 = await callWebhook(buildWebhookPayload("P4b", "P4B", w2, code));
    const midSt = await getOrderStatus(code);
    const r3 = await callWebhook(buildWebhookPayload("P4c", "P4C", w3, code));
    const after = await getSummary(TEST_MONTH_KEY);
    const st = await getOrderStatus(code);
    const recvTotal = w1 + w2 + w3;
    const expProfitTotal = PRICE - COST + w3;
    results.push({
      id: "P4",
      name: "3 webhook: 2 đầu đủ giá → TT; webhook 3 +DT +LN",
      ok:
        r1.status === 200 &&
        r2.status === 200 &&
        r3.status === 200 &&
        midSt === STATUS.PAID &&
        st === STATUS.PAID &&
        after.revenue - before.revenue === recvTotal &&
        after.profit - before.profit === expProfitTotal,
      detail: {
        statusAfterSecond: midSt,
        status: st,
        revenueDelta: after.revenue - before.revenue,
        profitDelta: after.profit - before.profit,
        expectRevenue: recvTotal,
        expectProfit: expProfitTotal,
      },
    });
  }

  // P6: webhook 1 < giá bán; webhook 2 = 2× giá — total_import chỉ +cost một lần (biên lai ngày VN = hôm nay, khớp logged_at)
  {
    const code = makeOrderCode("P6");
    await createOrder({ idOrder: code, status: STATUS.UNPAID });
    const before = await getSummary(monthKeyLiveVN);
    const w1 = Math.floor(PRICE / 2);
    const w2 = 2 * PRICE;
    const r1 = await callWebhook(
      buildWebhookPayload("P6a", "P6A", w1, code, paymentDateLiveVN)
    );
    const mid = await getOrderStatus(code);
    const r2 = await callWebhook(
      buildWebhookPayload("P6b", "P6B", w2, code, paymentDateLiveVN)
    );
    const after = await getSummary(monthKeyLiveVN);
    const st = await getOrderStatus(code);
    const impDelta = after.importVal - before.importVal;
    results.push({
      id: "P6",
      name: "Webhook 1 < giá; webhook 2 = 2× giá → TT; total_import chỉ +cost 1 lần",
      ok:
        r1.status === 200 &&
        r2.status === 200 &&
        mid === STATUS.UNPAID &&
        st === STATUS.PAID &&
        impDelta === COST,
      detail: {
        statusAfterFirst: mid,
        totalImportDelta: impDelta,
        expectImportDelta: COST,
        revenueDelta: after.revenue - before.revenue,
        profitDelta: after.profit - before.profit,
      },
    });
  }

  // P7: webhook 1 nhỏ; webhook 2 = 3× giá
  {
    const code = makeOrderCode("P7");
    await createOrder({ idOrder: code, status: STATUS.UNPAID });
    const before = await getSummary(monthKeyLiveVN);
    const w1 = 50_000;
    const w2 = 3 * PRICE;
    const r1 = await callWebhook(
      buildWebhookPayload("P7a", "P7A", w1, code, paymentDateLiveVN)
    );
    const r2 = await callWebhook(
      buildWebhookPayload("P7b", "P7B", w2, code, paymentDateLiveVN)
    );
    const after = await getSummary(monthKeyLiveVN);
    const st = await getOrderStatus(code);
    const impDelta = after.importVal - before.importVal;
    results.push({
      id: "P7",
      name: "Webhook 1 nhỏ; webhook 2 = 3× giá → TT; total_import chỉ +cost 1 lần",
      ok:
        r1.status === 200 &&
        r2.status === 200 &&
        st === STATUS.PAID &&
        impDelta === COST,
      detail: {
        totalImportDelta: impDelta,
        expectImportDelta: COST,
        status: st,
      },
    });
  }

  // P5: ĐXL → hoàn thành thủ công (biên lai manual dùng payment_date = UTC “hôm nay”, không phải TEST_MONTH_KEY)
  {
    const code = makeOrderCode("P5");
    const row = await createOrder({ idOrder: code, status: STATUS.PROCESSING });
    const manualPaidYmd = new Date().toISOString().slice(0, 10);
    const manualMonthKey = manualPaidYmd.slice(0, 7);
    const beforeManual = await getSummary(manualMonthKey);
    const stBefore = await getOrderStatus(code);
    const done = await completeProcessingOrderWithManualWebhook(row.id);
    const afterManual = await getSummary(manualMonthKey);
    const stAfter = await getOrderStatus(code);
    const recv = PRICE;
    const expProfit = recv - COST;
    results.push({
      id: "P5",
      name: "ĐXL: trước khi bấm hoàn thành không cộng DT/LN; sau → Đã TT; LN = tiền nhận − giá nhập",
      ok:
        done.status === 200 &&
        stBefore === STATUS.PROCESSING &&
        stAfter === STATUS.PAID &&
        afterManual.revenue - beforeManual.revenue === recv &&
        afterManual.profit - beforeManual.profit === expProfit,
      detail: {
        apiStatus: done.status,
        monthKey: manualMonthKey,
        statusBefore: stBefore,
        statusAfter: stAfter,
        revenueDelta: afterManual.revenue - beforeManual.revenue,
        profitDelta: afterManual.profit - beforeManual.profit,
        expectRevenue: recv,
        expectProfit: expProfit,
      },
    });
  }

  return results;
}

async function cleanup(monthKeysExtra = []) {
  const keys = [...new Set([TEST_MONTH_KEY, ...monthKeysExtra].filter(Boolean))];
  await pool.query(
    `
    DELETE FROM receipt.payment_receipt r
    USING orders.order_list o
    WHERE LOWER(COALESCE(r.id_order::text, '')) = LOWER(COALESCE(o.id_order::text, ''))
      AND o.customer ILIKE $1
    `,
    [`%${MARKER}%`]
  );
  await pool.query("DELETE FROM receipt.payment_receipt WHERE note ILIKE $1", [`%${MARKER}%`]);
  await pool.query(
    "DELETE FROM orders.order_list WHERE note ILIKE $1 OR customer ILIKE $1",
    [`%${MARKER}%`]
  );
  await pool.query("DELETE FROM dashboard.dashboard_monthly_summary WHERE month_key = ANY($1::text[])", [
    keys,
  ]);
}

(async () => {
  const vnMonthKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
  const utcMonthKey = new Date().toISOString().slice(0, 7);
  let results = [];
  let error = null;
  try {
    results = await run();
  } catch (err) {
    error = err;
  }
  try {
    await cleanup([vnMonthKey, utcMonthKey]);
  } catch (cleanupErr) {
    if (!error) error = cleanupErr;
  } finally {
    await pool.end();
  }

  const output = {
    marker: MARKER,
    monthKey: TEST_MONTH_KEY,
    monthKeyLiveVN: vnMonthKey,
    price: PRICE,
    cost: COST,
    requiredMin: Math.max(0, PRICE - 5000),
    success: !error && results.every((r) => r.ok),
    results,
    error: error ? { message: error.message, stack: error.stack } : null,
  };
  console.log(JSON.stringify(output, null, 2));
  if (error || results.some((r) => !r.ok)) {
    process.exit(1);
  }
})();
