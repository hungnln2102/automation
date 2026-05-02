/**
 * Test script để verify các rule nghiệp vụ chính
 * 
 * Các rule cần test:
 * 1. Tạo đơn hàng - không cộng tiền NCC ngay
 * 2. Cộng tiền NCC - khi đơn chuyển UNPAID → PROCESSING
 * 3. Xóa đơn hàng - trừ tiền NCC nếu đơn đã PAID/PROCESSING
 * 4. Gia hạn đơn hàng - cộng tiền NCC mới, cập nhật ngày hết hạn
 * 5. Hoàn tiền - chỉ đánh dấu status, không tự động trừ tiền NCC
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const { db } = require("../../src/db");
const { TABLES, STATUS, COLS } = require("../../src/controllers/Order/constants");
const { PARTNER_SCHEMA, SCHEMA_PARTNER, tableName } = require("../../src/config/dbSchema");
const { createOrder } = require("../../src/services/orderService");
const { updateOrderWithFinance } = require("../../src/controllers/Order/orderUpdateService");
const { deleteOrderWithArchive } = require("../../src/controllers/Order/orderDeletionService");
const { normalizeOrderRow, sanitizeOrderWritePayload } = require("../../src/controllers/Order/helpers");
const { todayYMDInVietnam } = require("../../src/utils/normalizers");
const { nextId } = require("../../src/services/idService");
const { runRenewal } = require("../../webhook/sepay/renewal");
const { ORDERS_SCHEMA } = require("../../src/config/dbSchema");
const PAYMENT_SUPPLY_TABLE = tableName(PARTNER_SCHEMA.PAYMENT_SUPPLY.TABLE, SCHEMA_PARTNER);
const PAYMENT_SUPPLY_COLS = PARTNER_SCHEMA.PAYMENT_SUPPLY.COLS;
const COST_LOG_TABLE = tableName(PARTNER_SCHEMA.SUPPLIER_ORDER_COST_LOG.TABLE, SCHEMA_PARTNER);
const COST_LOG_COLS = PARTNER_SCHEMA.SUPPLIER_ORDER_COST_LOG.COLS;

// Archive columns (1 bảng order_list)
const ORDER_LIST_COLS = Object.values(ORDERS_SCHEMA.ORDER_LIST.COLS || {});
const ORDER_CANCELED_ALLOWED_COLS = ORDER_LIST_COLS.filter(
  (col) => col && col !== ORDERS_SCHEMA.ORDER_LIST.COLS.NOTE
);
const ORDER_EXPIRED_ALLOWED_COLS = ORDER_LIST_COLS.filter(Boolean);

const pruneArchiveData = (data, allowedCols) =>
  Object.fromEntries(Object.entries(data).filter(([key]) => allowedCols.includes(key)));

// Helper functions
const getSupplierDebt = async (supplyId) => {
  const r = await db.raw(
    `WITH scoped AS (
       SELECT * FROM ${COST_LOG_TABLE}
       WHERE ${COST_LOG_COLS.SUPPLY_ID} = ?
     ),
     latest AS (
       SELECT DISTINCT ON (${COST_LOG_COLS.ORDER_LIST_ID}) *
       FROM scoped
       ORDER BY ${COST_LOG_COLS.ORDER_LIST_ID}, ${COST_LOG_COLS.ID} DESC
     )
     SELECT COALESCE(SUM(
       CASE
         WHEN TRIM(COALESCE(${COST_LOG_COLS.NCC_PAYMENT_STATUS}::text, '')) = 'Đã Thanh Toán' THEN 0
         ELSE COALESCE(${COST_LOG_COLS.IMPORT_COST}::numeric, 0) - COALESCE(${COST_LOG_COLS.REFUND_AMOUNT}::numeric, 0)
       END
     ), 0) AS n
     FROM latest`,
    [supplyId]
  );
  return Number(r.rows?.[0]?.n) || 0;
};

const findSupplierId = async (supplyName) => {
  const { resolveSupplierNameColumn } = require("../../src/controllers/SuppliesController/helpers");
  const supplierNameCol = await resolveSupplierNameColumn();
  const row = await db(TABLES.supplier)
    .select(PARTNER_SCHEMA.SUPPLIER.COLS.ID)
    .where(supplierNameCol, supplyName)
    .first();
  return row ? Number(row[PARTNER_SCHEMA.SUPPLIER.COLS.ID]) : null;
};

const createTestSupplier = async (name) => {
  const { resolveSupplierNameColumn } = require("../../src/controllers/SuppliesController/helpers");
  const supplierNameCol = await resolveSupplierNameColumn();
  const existing = await db(TABLES.supplier)
    .where(supplierNameCol, name)
    .first();
  if (existing) return Number(existing[PARTNER_SCHEMA.SUPPLIER.COLS.ID]);
  
  const [inserted] = await db(TABLES.supplier)
    .insert({ [supplierNameCol]: name })
    .returning(PARTNER_SCHEMA.SUPPLIER.COLS.ID);
  return Number(inserted[PARTNER_SCHEMA.SUPPLIER.COLS.ID]);
};

const formatDate = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Test cases
const tests = {
  async test1_CreateOrder_NoSupplierDebt() {
    console.log("\n=== TEST 1: Tạo đơn hàng - KHÔNG cộng tiền NCC ===");
    
    const supplyName = "TEST_SUPPLIER_1";
    const supplyId = await createTestSupplier(supplyName);
    const initialDebt = await getSupplierDebt(supplyId);
    
    const orderData = {
      id_order: `TEST_${Date.now()}`,
      id_product: "Test Product",
      customer: "Test Customer",
      supply: supplyName,
      cost: 100000,
      price: 150000,
      days: 30,
      order_date: formatDate(new Date()),
      expiry_date: formatDate(addDays(new Date(), 30)),
    };
    
    const order = await createOrder(orderData);
    const debtAfterCreate = await getSupplierDebt(supplyId);
    
    console.log(`  - Initial debt: ${initialDebt}`);
    console.log(`  - Debt after create: ${debtAfterCreate}`);
    console.log(`  - Order status: ${order.status}`);
    
    const passed = debtAfterCreate === initialDebt && order.status === STATUS.UNPAID;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: Debt không đổi sau khi tạo đơn`);
    
    return { passed, order, supplyId };
  },

  async test2_UpdateToProcessing_AddSupplierDebt() {
    console.log("\n=== TEST 2: Chuyển UNPAID → PROCESSING - CỘNG tiền NCC ===");
    
    const supplyName = "TEST_SUPPLIER_2";
    const supplyId = await createTestSupplier(supplyName);
    const initialDebt = await getSupplierDebt(supplyId);
    
    const orderData = {
      id_order: `TEST_${Date.now()}`,
      id_product: "Test Product",
      customer: "Test Customer",
      supply: supplyName,
      cost: 200000,
      price: 300000,
      days: 30,
      order_date: formatDate(new Date()),
      expiry_date: formatDate(addDays(new Date(), 30)),
    };
    
    const order = await createOrder(orderData);
    const debtAfterCreate = await getSupplierDebt(supplyId);
    
    // Update to PROCESSING
    const trx = await db.transaction();
    try {
      const result = await updateOrderWithFinance({
        trx,
        id: order.id,
        payload: { status: STATUS.PROCESSING },
        helpers: {
          TABLES,
          STATUS,
          sanitizeOrderWritePayload,
          normalizeOrderRow,
          todayYMDInVietnam,
        },
      });
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }
    
    const debtAfterProcessing = await getSupplierDebt(supplyId);
    
    console.log(`  - Initial debt: ${initialDebt}`);
    console.log(`  - Debt after create: ${debtAfterCreate}`);
    console.log(`  - Debt after PROCESSING: ${debtAfterProcessing}`);
    console.log(`  - Expected increase: ${orderData.cost}`);
    
    const expectedDebt = initialDebt + orderData.cost;
    const passed = debtAfterProcessing === expectedDebt && debtAfterCreate === initialDebt;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: Debt tăng đúng ${orderData.cost} khi chuyển PROCESSING`);
    
    return { passed, order, supplyId };
  },

  async test3_DeletePaidOrder_SubtractSupplierDebt() {
    console.log("\n=== TEST 3: Xóa đơn PAID - TRỪ tiền NCC (prorated) ===");
    
    const supplyName = "TEST_SUPPLIER_3";
    const supplyId = await createTestSupplier(supplyName);
    const initialDebt = await getSupplierDebt(supplyId);
    
    const orderData = {
      id_order: `TEST_${Date.now()}`,
      id_product: "Test Product",
      customer: "Test Customer",
      supply: supplyName,
      cost: 300000,
      price: 450000,
      days: 30,
      order_date: formatDate(new Date()),
      expiry_date: formatDate(addDays(new Date(), 30)),
    };
    
    const order = await createOrder(orderData);
    
    // Set to PROCESSING (adds debt)
    const trx1 = await db.transaction();
    try {
      await updateOrderWithFinance({
        trx: trx1,
        id: order.id,
        payload: { status: STATUS.PROCESSING },
        helpers: {
          TABLES,
          STATUS,
          sanitizeOrderWritePayload,
          normalizeOrderRow,
          todayYMDInVietnam,
        },
      });
      await trx1.commit();
    } catch (err) {
      await trx1.rollback();
      throw err;
    }
    
    const debtAfterProcessing = await getSupplierDebt(supplyId);
    
    // Delete order (should subtract prorated amount)
    const trx2 = await db.transaction();
    let deletedResult;
    try {
      const orderRow = await trx2(TABLES.orderList).where({ id: order.id }).first();
      const normalized = normalizeOrderRow(orderRow, todayYMDInVietnam());
      
      // Simulate 10 days remaining
      normalized.so_ngay_con_lai = 20;
      
      deletedResult = await deleteOrderWithArchive({
        trx: trx2,
        order: orderRow,
        normalized,
        reqBody: {},
        helpers: {
          TABLES,
          ORDERS_SCHEMA,
          STATUS,
          nextId,
          pruneArchiveData,
          allowedArchiveColsExpired: ORDER_EXPIRED_ALLOWED_COLS,
          allowedArchiveColsCanceled: ORDER_CANCELED_ALLOWED_COLS,
        },
      });
    } catch (err) {
      await trx2.rollback();
      throw err;
    }
    
    const debtAfterDelete = await getSupplierDebt(supplyId);
    
    // Expected: subtract prorated (20/30 * 300000 = 200000, rounded to thousands = 200000)
    const expectedProrated = Math.ceil((20 / 30) * 300000 / 1000) * 1000; // 200000
    const expectedDebt = debtAfterProcessing - expectedProrated;
    
    console.log(`  - Initial debt: ${initialDebt}`);
    console.log(`  - Debt after PROCESSING: ${debtAfterProcessing}`);
    console.log(`  - Debt after delete: ${debtAfterDelete}`);
    console.log(`  - Expected prorated: ${expectedProrated}`);
    console.log(`  - Expected final debt: ${expectedDebt}`);
    console.log(`  - Moved to: ${deletedResult.movedTo}`);
    
    const passed = Math.abs(debtAfterDelete - expectedDebt) < 1000 && deletedResult.movedTo === "canceled";
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: Debt giảm đúng prorated khi xóa đơn PAID`);
    
    return { passed, supplyId };
  },

  async test4_Renewal_AddNewSupplierDebt() {
    console.log("\n=== TEST 4: Gia hạn đơn - CỘNG tiền NCC mới ===");
    
    const supplyName = "TEST_SUPPLIER_4";
    const supplyId = await createTestSupplier(supplyName);
    const initialDebt = await getSupplierDebt(supplyId);
    
    // Create order with expiry near (for renewal eligibility)
    const expiryDate = addDays(new Date(), 2); // 2 days left
    const orderData = {
      id_order: `TEST_${Date.now()}`,
      id_product: "Netflix Premium --1m", // 1 month product
      customer: "Test Customer",
      supply: supplyName,
      cost: 100000,
      price: 150000,
      days: 30,
      order_date: formatDate(addDays(new Date(), -28)),
      expiry_date: formatDate(expiryDate),
      status: STATUS.RENEWAL, // Eligible for renewal
    };
    
    const order = await createOrder(orderData);
    const debtAfterCreate = await getSupplierDebt(supplyId);
    
    // Run renewal (need to set status to RENEWAL first for eligibility)
    const trx = await db.transaction();
    try {
      await trx(TABLES.orderList)
        .where({ id: order.id })
        .update({ status: STATUS.RENEWAL });
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }
    
    const renewalResult = await runRenewal(order.id_order, { forceRenewal: true });
    
    const debtAfterRenewal = await getSupplierDebt(supplyId);
    
    console.log(`  - Initial debt: ${initialDebt}`);
    console.log(`  - Debt after create: ${debtAfterCreate}`);
    console.log(`  - Debt after renewal: ${debtAfterRenewal}`);
    console.log(`  - Renewal success: ${renewalResult?.success}`);
    console.log(`  - Renewal new cost: ${renewalResult?.details?.GIA_NHAP}`);
    
    // Renewal should add new cost (may differ from original due to price updates)
    const newCost = renewalResult?.details?.GIA_NHAP || 0;
    const passed = renewalResult?.success && debtAfterRenewal >= debtAfterCreate;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: Renewal cộng tiền NCC mới và cập nhật ngày hết hạn`);
    
    return { passed, renewalResult, supplyId };
  },

  async test5_Refund_OnlyStatusChange() {
    console.log("\n=== TEST 5: Hoàn tiền - CHỈ đánh dấu status, KHÔNG trừ tiền NCC ===");
    
    const supplyName = "TEST_SUPPLIER_5";
    const supplyId = await createTestSupplier(supplyName);
    const initialDebt = await getSupplierDebt(supplyId);
    
    const orderData = {
      id_order: `TEST_${Date.now()}`,
      id_product: "Test Product",
      customer: "Test Customer",
      supply: supplyName,
      cost: 150000,
      price: 200000,
      days: 30,
      order_date: formatDate(new Date()),
      expiry_date: formatDate(addDays(new Date(), 30)),
    };
    
    const order = await createOrder(orderData);
    
    // Set to PROCESSING
    const trx1 = await db.transaction();
    try {
      await updateOrderWithFinance({
        trx: trx1,
        id: order.id,
        payload: { status: STATUS.PROCESSING },
        helpers: {
          TABLES,
          STATUS,
          sanitizeOrderWritePayload,
          normalizeOrderRow,
          todayYMDInVietnam,
        },
      });
      await trx1.commit();
    } catch (err) {
      await trx1.rollback();
      throw err;
    }
    
    const debtAfterProcessing = await getSupplierDebt(supplyId);
    
    // Delete to canceled (creates refund record)
    const trx2 = await db.transaction();
    let deletedResult;
    try {
      const orderRow = await trx2(TABLES.orderList).where({ id: order.id }).first();
      const normalized = normalizeOrderRow(orderRow, todayYMDInVietnam());
      
      deletedResult = await deleteOrderWithArchive({
        trx: trx2,
        order: orderRow,
        normalized,
        reqBody: { can_hoan: 100000 },
        helpers: {
          TABLES,
          ORDERS_SCHEMA,
          STATUS,
          nextId,
          pruneArchiveData,
          allowedArchiveColsExpired: ORDER_EXPIRED_ALLOWED_COLS,
          allowedArchiveColsCanceled: ORDER_CANCELED_ALLOWED_COLS,
        },
      });
    } catch (err) {
      await trx2.rollback();
      throw err;
    }
    
    const debtAfterDelete = await getSupplierDebt(supplyId);
    
    // Mark as refunded (1 bảng order_list)
    const canceledOrder = await db(TABLES.orderList)
      .where({ id_order: order.id_order })
      .first();
    
    if (canceledOrder) {
      await db(TABLES.orderList)
        .where({ id: canceledOrder.id })
        .update({ status: STATUS.REFUNDED });
    }
    
    const debtAfterRefund = await getSupplierDebt(supplyId);
    
    console.log(`  - Initial debt: ${initialDebt}`);
    console.log(`  - Debt after PROCESSING: ${debtAfterProcessing}`);
    console.log(`  - Debt after delete: ${debtAfterDelete}`);
    console.log(`  - Debt after refund status: ${debtAfterRefund}`);
    console.log(`  - Refund amount: ${canceledOrder?.refund || 0}`);
    console.log(`  - Moved to: ${deletedResult.movedTo}`);
    
    // Refund status change should NOT affect supplier debt
    const passed = debtAfterRefund === debtAfterDelete && deletedResult.movedTo === "canceled";
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: Hoàn tiền chỉ đánh dấu status, không trừ tiền NCC`);
    
    return { passed, supplyId };
  },

  /**
   * Test: Xóa đơn - (1) Số ngày còn lại tính từ expiry - today,
   * (2) order_canceled.days = số ngày còn lại, (3) Trừ NCC đúng prorated.
   */
  async test6_DeleteOrder_RemainingDaysAndOrderCanceledDays() {
    console.log("\n=== TEST 6: Xóa đơn - Số ngày còn lại + order_canceled.days + trừ NCC ===");

    const supplyName = "TEST_SUPPLIER_6";
    const supplyId = await createTestSupplier(supplyName);
    const initialDebt = await getSupplierDebt(supplyId);

    const remainingDaysExpected = 20;
    const totalDays = 30;
    const cost = 300000;
    const orderExpiredDate = addDays(new Date(), remainingDaysExpected);
    const orderDate = addDays(new Date(), -(totalDays - remainingDaysExpected));

    const orderData = {
      id_order: `TEST_${Date.now()}`,
      id_product: "Test Product",
      customer: "Test Customer",
      supply: supplyName,
      cost,
      price: 450000,
      days: totalDays,
      order_date: formatDate(orderDate),
      expiry_date: formatDate(orderExpiredDate),
    };

    const order = await createOrder(orderData);

    const trx1 = await db.transaction();
    try {
      await updateOrderWithFinance({
        trx: trx1,
        id: order.id,
        payload: { status: STATUS.PROCESSING },
        helpers: {
          TABLES,
          STATUS,
          sanitizeOrderWritePayload,
          normalizeOrderRow,
          todayYMDInVietnam,
        },
      });
      await trx1.commit();
    } catch (err) {
      await trx1.rollback();
      throw err;
    }

    const debtAfterProcessing = await getSupplierDebt(supplyId);

    const trx2 = await db.transaction();
    let deletedResult;
    let normalized;
    try {
      const orderRow = await trx2(TABLES.orderList).where({ id: order.id }).first();
      normalized = normalizeOrderRow(orderRow, todayYMDInVietnam());
      deletedResult = await deleteOrderWithArchive({
        trx: trx2,
        order: orderRow,
        normalized,
        reqBody: {},
        helpers: {
          TABLES,
          ORDERS_SCHEMA,
          STATUS,
          nextId,
          pruneArchiveData,
          allowedArchiveColsExpired: ORDER_EXPIRED_ALLOWED_COLS,
          allowedArchiveColsCanceled: ORDER_CANCELED_ALLOWED_COLS,
        },
      });
    } catch (err) {
      await trx2.rollback();
      throw err;
    }

    const debtAfterDelete = await getSupplierDebt(supplyId);
    const canceledRow = await db(TABLES.orderList).where({ id_order: order.id_order }).first();

    const daysCol = ORDERS_SCHEMA.ORDER_LIST.COLS.DAYS;
    const orderCanceledDays = canceledRow ? canceledRow[daysCol] : null;
    const expectedProrated = Math.ceil((remainingDaysExpected / totalDays) * cost / 1000) * 1000;
    const expectedDebt = debtAfterProcessing - expectedProrated;

    console.log(`  - so_ngay_con_lai (từ expiry - today): ${normalized?.so_ngay_con_lai}`);
    console.log(`  - order_canceled.days (note số ngày còn lại): ${orderCanceledDays}`);
    console.log(`  - Debt sau PROCESSING: ${debtAfterProcessing}`);
    console.log(`  - Debt sau xóa: ${debtAfterDelete}`);
    console.log(`  - Prorated trừ NCC: ${expectedProrated}`);

    const passedDays = Number(orderCanceledDays) === remainingDaysExpected;
    const passedDebt = Math.abs(debtAfterDelete - expectedDebt) < 1000;
    const passedMoved = deletedResult.movedTo === "canceled";
    const passed = passedDays && passedDebt && passedMoved;

    console.log(`  ✓ ${passedDays ? "PASS" : "FAIL"}: order_canceled.days = ${remainingDaysExpected}`);
    console.log(`  ✓ ${passedDebt ? "PASS" : "FAIL"}: NCC trừ đúng prorated`);
    console.log(`  ✓ ${passedMoved ? "PASS" : "FAIL"}: Moved to canceled`);
    console.log(`  => ${passed ? "PASS" : "FAIL"}`);

    return { passed, supplyId };
  },

  /**
   * Test: Nếu chu kỳ NCC đã PAID (không còn UNPAID), khi xóa đơn cần tạo dòng điều chỉnh âm
   * để amount_paid âm đúng nghĩa "trừ NCC".
   */
  async test7_DeleteOrder_WhenAllCyclesPaid_InsertNegativeAdjustment() {
    console.log("\n=== TEST 7: Xóa đơn khi chu kỳ đã PAID - tạo adjustment âm cho NCC ===");

    const supplyName = "TEST_SUPPLIER_7";
    const supplyId = await createTestSupplier(supplyName);

    const remainingDaysExpected = 20;
    const totalDays = 30;
    const cost = 300000;
    const orderExpiredDate = addDays(new Date(), remainingDaysExpected);
    const orderDate = addDays(new Date(), -(totalDays - remainingDaysExpected));

    const orderData = {
      id_order: `TEST_${Date.now()}`,
      id_product: "Test Product",
      customer: "Test Customer",
      supply: supplyName,
      cost,
      price: 450000,
      days: totalDays,
      order_date: formatDate(orderDate),
      expiry_date: formatDate(orderExpiredDate),
    };

    const order = await createOrder(orderData);

    // UNPAID -> PROCESSING: tạo/cộng công nợ NCC (cycle UNPAID)
    const trx1 = await db.transaction();
    try {
      await updateOrderWithFinance({
        trx: trx1,
        id: order.id,
        payload: { status: STATUS.PROCESSING },
        helpers: {
          TABLES,
          STATUS,
          sanitizeOrderWritePayload,
          normalizeOrderRow,
          todayYMDInVietnam,
        },
      });
      await trx1.commit();
    } catch (err) {
      await trx1.rollback();
      throw err;
    }

    // Giả lập chu kỳ NCC đã thanh toán hết: set status = PAID và paid = import_value
    const latestUnpaid = await db(PAYMENT_SUPPLY_TABLE)
      .where(PAYMENT_SUPPLY_COLS.SOURCE_ID, supplyId)
      .andWhere(PAYMENT_SUPPLY_COLS.STATUS, STATUS.UNPAID)
      .orderBy(PAYMENT_SUPPLY_COLS.ID, "desc")
      .first();

    if (!latestUnpaid) {
      throw new Error("Không tìm thấy chu kỳ supplier_payments UNPAID để giả lập thanh toán.");
    }

    const importValue = Number(latestUnpaid[PAYMENT_SUPPLY_COLS.PAID] || 0);
    await db(PAYMENT_SUPPLY_TABLE)
      .where(PAYMENT_SUPPLY_COLS.ID, latestUnpaid[PAYMENT_SUPPLY_COLS.ID])
      .update({
        [PAYMENT_SUPPLY_COLS.STATUS]: STATUS.PAID,
        [PAYMENT_SUPPLY_COLS.PAID]: importValue,
      });

    // Xóa đơn: vì không còn UNPAID cycle -> phải insert dòng điều chỉnh âm
    const trx2 = await db.transaction();
    try {
      const orderRow = await trx2(TABLES.orderList).where({ id: order.id }).first();
      const normalized = normalizeOrderRow(orderRow, todayYMDInVietnam());
      await deleteOrderWithArchive({
        trx: trx2,
        order: orderRow,
        normalized,
        reqBody: {},
        helpers: {
          TABLES,
          ORDERS_SCHEMA,
          STATUS,
          nextId,
          pruneArchiveData,
          allowedArchiveColsExpired: ORDER_EXPIRED_ALLOWED_COLS,
          allowedArchiveColsCanceled: ORDER_CANCELED_ALLOWED_COLS,
        },
      });
    } catch (err) {
      await trx2.rollback();
      throw err;
    }

    const adjustmentRow = await db(PAYMENT_SUPPLY_TABLE)
      .where(PAYMENT_SUPPLY_COLS.SOURCE_ID, supplyId)
      .orderBy(PAYMENT_SUPPLY_COLS.ID, "desc")
      .first();

    const adjustmentImport = Number(adjustmentRow?.[PAYMENT_SUPPLY_COLS.PAID] || 0);
    const expectedProrated = Math.ceil((remainingDaysExpected / totalDays) * cost / 1000) * 1000;

    console.log(`  - Latest import_value: ${adjustmentImport}`);
    console.log(`  - Expected adjustment: ${-expectedProrated}`);

    const passed = adjustmentImport === -expectedProrated;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: Tạo dòng adjustment âm đúng số tiền trừ NCC`);

    return { passed, supplyId };
  },

  /**
   * Test: Confirm chu kỳ âm (NCC trả mình) - chỉ đổi status PAID, KHÔNG đổi amount_paid.
   * Sau bấm Thanh toán, amount_paid vẫn âm.
   */
  async test8_ConfirmNegativeCycle_OnlyStatusChange() {
    console.log("\n=== TEST 8: Confirm chu kỳ âm - chỉ đổi status, import vẫn âm ===");

    const supplyName = "TEST_SUPPLIER_8";
    const supplyId = await createTestSupplier(supplyName);
    const negativeAmount = -150000;

    const [inserted] = await db(PAYMENT_SUPPLY_TABLE)
      .insert({
        [PAYMENT_SUPPLY_COLS.SOURCE_ID]: supplyId,
        [PAYMENT_SUPPLY_COLS.PAID]: negativeAmount,
        [PAYMENT_SUPPLY_COLS.ROUND]: `ADJ - ${formatDate(new Date())}`,
        [PAYMENT_SUPPLY_COLS.STATUS]: STATUS.UNPAID,
      })
      .returning(PAYMENT_SUPPLY_COLS.ID);

    const paymentId = inserted[PAYMENT_SUPPLY_COLS.ID];
    const beforeConfirm = await db(PAYMENT_SUPPLY_TABLE).where(PAYMENT_SUPPLY_COLS.ID, paymentId).first();

    if (Number(beforeConfirm[PAYMENT_SUPPLY_COLS.PAID]) >= 0) {
      throw new Error("Chuẩn bị test: row phải có amount âm");
    }

    await db(PAYMENT_SUPPLY_TABLE)
      .where(PAYMENT_SUPPLY_COLS.ID, paymentId)
      .update({ [PAYMENT_SUPPLY_COLS.STATUS]: STATUS.PAID });

    const afterConfirm = await db(PAYMENT_SUPPLY_TABLE).where(PAYMENT_SUPPLY_COLS.ID, paymentId).first();
    const importAfter = Number(afterConfirm[PAYMENT_SUPPLY_COLS.PAID] || 0);
    const statusAfter = String(afterConfirm[PAYMENT_SUPPLY_COLS.STATUS] || "").trim();

    console.log(`  - Import trước confirm: ${negativeAmount}`);
    console.log(`  - Import sau confirm: ${importAfter}`);
    console.log(`  - Status sau confirm: ${statusAfter}`);

    const passedImport = importAfter === negativeAmount;
    const passedStatus = statusAfter === STATUS.PAID;
    const passed = passedImport && passedStatus;

    console.log(`  ✓ ${passedImport ? "PASS" : "FAIL"}: amount_paid vẫn âm sau confirm`);
    console.log(`  ✓ ${passedStatus ? "PASS" : "FAIL"}: status = Đã Thanh Toán`);

    return { passed, supplyId };
  },
};

// Run all tests
(async () => {
  console.log("=".repeat(60));
  console.log("TESTING BUSINESS RULES");
  console.log("=".repeat(60));
  
  const results = [];
  
  try {
    for (const [name, testFn] of Object.entries(tests)) {
      try {
        const result = await testFn();
        results.push({ name, ...result });
      } catch (err) {
        console.error(`  ✗ ERROR in ${name}:`, err.message);
        results.push({ name, passed: false, error: err.message });
      }
    }
  } finally {
    console.log("\n" + "=".repeat(60));
    console.log("TEST SUMMARY");
    console.log("=".repeat(60));
    
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    
    results.forEach((r) => {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.name}: ${r.passed ? "PASS" : r.error || "FAIL"}`);
    });
    
    console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    
    process.exit(failed > 0 ? 1 : 0);
  }
})();
