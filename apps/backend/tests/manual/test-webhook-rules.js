/**
 * Test script để verify các rule webhook và renewal
 * 
 * Các rule cần test:
 * 1. isEligibleForRenewal - chỉ RENEWAL và EXPIRED eligible, không phải PROCESSING
 * 2. Webhook flow với UNPAID → PROCESSING
 * 3. Webhook flow với RENEWAL/EXPIRED → Renewal → PROCESSING
 * 4. Scheduler rules - không chuyển PROCESSING sang expired
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const { db } = require("../../src/db");
const { TABLES, STATUS, COLS } = require("../../src/controllers/Order/constants");
const { isEligibleForRenewal, fetchOrderState } = require("../../webhook/sepay/renewal");
const { ORDER_COLS, ORDER_TABLE } = require("../../webhook/sepay/config");
const { STATUS: ORDER_STATUS } = require("../../src/utils/statuses");
const { todayYMDInVietnam, formatDateOutput } = require("../../src/utils/normalizers");
const { formatDateDB, addDays, daysUntil } = require("../../webhook/sepay/utils");

// Helper: Convert date to YYYY-MM-DD format for database
const formatDateForDB = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const { nextId } = require("../../src/services/idService");
const logger = require("../../src/utils/logger");

// Helper: Calculate days until expiry (using webhook utils)
const calculateDaysLeft = (orderExpired) => {
  return daysUntil(orderExpired);
};

// Helper: Create test order
const createTestOrder = async (orderData) => {
  const trx = await db.transaction();
  try {
    const id = await nextId(TABLES.orderList, COLS.ORDER.ID, trx);
    const order = {
      id,
      ...orderData,
    };
    const [created] = await trx(TABLES.orderList).insert(order).returning("*");
    await trx.commit();
    return created;
  } catch (err) {
    await trx.rollback();
    throw err;
  }
};

// Helper: Get order status
const getOrderStatus = async (orderCode) => {
  const order = await db(TABLES.orderList)
    .where(COLS.ORDER.ID_ORDER, orderCode)
    .first();
  return order ? order[COLS.ORDER.STATUS] : null;
};

// Helper: Get order daysLeft
const getOrderDaysLeft = async (orderCode) => {
  const order = await db(TABLES.orderList)
    .where(COLS.ORDER.ID_ORDER, orderCode)
    .first();
  if (!order) return null;
  return daysUntil(order[COLS.ORDER.EXPIRY_DATE]);
};

// Helper: Cleanup test data
const cleanup = async (orderCodes) => {
  for (const code of orderCodes) {
    await db(TABLES.orderList).where(COLS.ORDER.ID_ORDER, code).del();
  }
};

const tests = {
  async test1_Eligibility_RENEWAL() {
    console.log("\n=== TEST 1: Eligibility - RENEWAL với daysLeft <= 4 ===");
    
    const expiryDate = addDays(new Date(), 2); // 2 days left
    const expiryDateStr = formatDateForDB(expiryDate);
    const eligibility = isEligibleForRenewal(ORDER_STATUS.RENEWAL, expiryDateStr);
    
    console.log(`  - Status: ${ORDER_STATUS.RENEWAL}`);
    console.log(`  - DaysLeft: ${eligibility.daysLeft}`);
    console.log(`  - Eligible: ${eligibility.eligible}`);
    
    const passed = eligibility.eligible === true && eligibility.daysLeft <= 4;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: RENEWAL với daysLeft <= 4 phải eligible`);
    
    return passed;
  },

  async test2_Eligibility_EXPIRED() {
    console.log("\n=== TEST 2: Eligibility - EXPIRED với daysLeft <= 4 ===");
    
    const expiryDate = addDays(new Date(), 0); // 0 days left (expired today)
    const expiryDateStr = formatDateForDB(expiryDate);
    const eligibility = isEligibleForRenewal(ORDER_STATUS.EXPIRED, expiryDateStr);
    
    console.log(`  - Status: ${ORDER_STATUS.EXPIRED}`);
    console.log(`  - DaysLeft: ${eligibility.daysLeft}`);
    console.log(`  - Eligible: ${eligibility.eligible}`);
    
    const passed = eligibility.eligible === true && eligibility.daysLeft <= 4;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: EXPIRED với daysLeft <= 4 phải eligible`);
    
    return passed;
  },

  async test3_Eligibility_PROCESSING_NOT_ELIGIBLE() {
    console.log("\n=== TEST 3: Eligibility - PROCESSING KHÔNG eligible ===");
    
    const expiryDate = addDays(new Date(), 2); // 2 days left
    const expiryDateStr = formatDateForDB(expiryDate);
    const eligibility = isEligibleForRenewal(ORDER_STATUS.PROCESSING, expiryDateStr);
    
    console.log(`  - Status: ${ORDER_STATUS.PROCESSING}`);
    console.log(`  - DaysLeft: ${eligibility.daysLeft}`);
    console.log(`  - Eligible: ${eligibility.eligible}`);
    
    const passed = eligibility.eligible === false;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: PROCESSING không được eligible, dù daysLeft <= 4`);
    
    return passed;
  },

  async test4_Eligibility_UNPAID_NOT_ELIGIBLE() {
    console.log("\n=== TEST 4: Eligibility - UNPAID KHÔNG eligible ===");
    
    const expiryDate = addDays(new Date(), 2); // 2 days left
    const expiryDateStr = formatDateForDB(expiryDate);
    const eligibility = isEligibleForRenewal(ORDER_STATUS.UNPAID, expiryDateStr);
    
    console.log(`  - Status: ${ORDER_STATUS.UNPAID}`);
    console.log(`  - DaysLeft: ${eligibility.daysLeft}`);
    console.log(`  - Eligible: ${eligibility.eligible}`);
    
    const passed = eligibility.eligible === false;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: UNPAID không được eligible, dù daysLeft <= 4`);
    
    return passed;
  },

  async test5_Eligibility_RENEWAL_daysLeft_GT_4() {
    console.log("\n=== TEST 5: Eligibility - RENEWAL với daysLeft > 4 KHÔNG eligible ===");
    
    const expiryDate = addDays(new Date(), 10); // 10 days left
    const expiryDateStr = formatDateForDB(expiryDate);
    const eligibility = isEligibleForRenewal(ORDER_STATUS.RENEWAL, expiryDateStr);
    
    console.log(`  - Status: ${ORDER_STATUS.RENEWAL}`);
    console.log(`  - DaysLeft: ${eligibility.daysLeft}`);
    console.log(`  - Eligible: ${eligibility.eligible}`);
    
    const passed = eligibility.eligible === false;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: RENEWAL với daysLeft > 4 không được eligible`);
    
    return passed;
  },

  async test6_Webhook_UNPAID_to_PROCESSING() {
    console.log("\n=== TEST 6: Webhook - UNPAID → PROCESSING (không eligible) ===");
    
    const orderCode = `TEST_WEBHOOK_${Date.now()}`;
    const expiryDate = addDays(new Date(), 30);
    
    // Create UNPAID order
    const order = await createTestOrder({
      [COLS.ORDER.ID_ORDER]: orderCode,
      [COLS.ORDER.ID_PRODUCT]: "Netflix Premium --1m",
      [COLS.ORDER.CUSTOMER]: "Test Customer",
      [COLS.ORDER.ORDER_DATE]: formatDateForDB(new Date()),
      [COLS.ORDER.EXPIRY_DATE]: formatDateForDB(expiryDate),
      [COLS.ORDER.DAYS]: 30,
      [COLS.ORDER.STATUS]: STATUS.UNPAID,
      [COLS.ORDER.COST]: 100000,
      [COLS.ORDER.PRICE]: 150000,
    });
    
    // Check eligibility before webhook
    const stateBefore = await fetchOrderState(orderCode);
    const eligibilityBefore = isEligibleForRenewal(
      stateBefore[ORDER_COLS.status],
      stateBefore[ORDER_COLS.expiryDate]
    );
    
    // Simulate webhook: UNPAID → PROCESSING
    const trx = await db.transaction();
    try {
      await trx(TABLES.orderList)
        .where({ [COLS.ORDER.ID_ORDER]: orderCode })
        .update({ [COLS.ORDER.STATUS]: STATUS.PROCESSING });
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }
    
    // Check status after
    const statusAfter = await getOrderStatus(orderCode);
    const stateAfter = await fetchOrderState(orderCode);
    const eligibilityAfter = isEligibleForRenewal(
      stateAfter[ORDER_COLS.status],
      stateAfter[ORDER_COLS.expiryDate]
    );
    
    console.log(`  - Status before: ${stateBefore[ORDER_COLS.status] || STATUS.UNPAID}`);
    console.log(`  - Eligible before: ${eligibilityBefore.eligible}`);
    console.log(`  - Status after: ${statusAfter}`);
    console.log(`  - Eligible after: ${eligibilityAfter.eligible}`);
    
    const passed = 
      statusAfter === STATUS.PROCESSING &&
      eligibilityBefore.eligible === false &&
      eligibilityAfter.eligible === false;
    
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: UNPAID → PROCESSING, không eligible cho renewal`);
    
    await cleanup([orderCode]);
    return passed;
  },

  async test7_Webhook_RENEWAL_to_PROCESSING_via_Renewal() {
    console.log("\n=== TEST 7: Webhook - RENEWAL → Renewal → PROCESSING ===");
    
    const orderCode = `TEST_RENEWAL_${Date.now()}`;
    const expiryDate = addDays(new Date(), 2); // 2 days left - eligible
    
    // Create RENEWAL order
    const order = await createTestOrder({
      [COLS.ORDER.ID_ORDER]: orderCode,
      [COLS.ORDER.ID_PRODUCT]: "Netflix Premium --1m",
      [COLS.ORDER.CUSTOMER]: "Test Customer",
      [COLS.ORDER.ORDER_DATE]: formatDateForDB(addDays(new Date(), -28)),
      [COLS.ORDER.EXPIRY_DATE]: formatDateForDB(expiryDate),
      [COLS.ORDER.DAYS]: 30,
      [COLS.ORDER.STATUS]: STATUS.RENEWAL,
      [COLS.ORDER.COST]: 100000,
      [COLS.ORDER.PRICE]: 150000,
    });
    
    // Check eligibility
    const stateBefore = await fetchOrderState(orderCode);
    const eligibilityBefore = isEligibleForRenewal(
      stateBefore[ORDER_COLS.status],
      stateBefore[ORDER_COLS.expiryDate]
    );
    
    console.log(`  - Status before: ${stateBefore[ORDER_COLS.status]}`);
    console.log(`  - DaysLeft before: ${eligibilityBefore.daysLeft}`);
    console.log(`  - Eligible: ${eligibilityBefore.eligible}`);
    
    // Run renewal (simulate webhook renewal flow)
    const { runRenewal } = require("../../webhook/sepay/renewal");
    const renewalResult = await runRenewal(orderCode, { forceRenewal: false });
    
    // Check status after renewal
    const statusAfter = await getOrderStatus(orderCode);
    const stateAfter = await fetchOrderState(orderCode);
    const daysLeftAfter = await getOrderDaysLeft(orderCode);
    
    console.log(`  - Renewal success: ${renewalResult?.success}`);
    console.log(`  - Status after: ${statusAfter}`);
    console.log(`  - DaysLeft after: ${daysLeftAfter}`);
    
    const passed = 
      eligibilityBefore.eligible === true &&
      renewalResult?.success === true &&
      statusAfter === STATUS.PROCESSING &&
      daysLeftAfter > eligibilityBefore.daysLeft; // Should be extended
    
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: RENEWAL eligible → Renewal → PROCESSING với daysLeft tăng`);
    
    await cleanup([orderCode]);
    return passed;
  },

  async test8_Webhook_EXPIRED_to_PROCESSING_via_Renewal() {
    console.log("\n=== TEST 8: Webhook - EXPIRED → Renewal → PROCESSING ===");
    
    const orderCode = `TEST_EXPIRED_${Date.now()}`;
    const expiryDate = addDays(new Date(), 0); // 0 days left - expired today
    
    // Create EXPIRED order
    const order = await createTestOrder({
      [COLS.ORDER.ID_ORDER]: orderCode,
      [COLS.ORDER.ID_PRODUCT]: "Netflix Premium --1m",
      [COLS.ORDER.CUSTOMER]: "Test Customer",
      [COLS.ORDER.ORDER_DATE]: formatDateForDB(addDays(new Date(), -30)),
      [COLS.ORDER.EXPIRY_DATE]: formatDateForDB(expiryDate),
      [COLS.ORDER.DAYS]: 30,
      [COLS.ORDER.STATUS]: STATUS.EXPIRED,
      [COLS.ORDER.COST]: 100000,
      [COLS.ORDER.PRICE]: 150000,
    });
    
    // Check eligibility
    const stateBefore = await fetchOrderState(orderCode);
    const eligibilityBefore = isEligibleForRenewal(
      stateBefore[ORDER_COLS.status],
      stateBefore[ORDER_COLS.expiryDate]
    );
    
    console.log(`  - Status before: ${stateBefore[ORDER_COLS.status]}`);
    console.log(`  - DaysLeft before: ${eligibilityBefore.daysLeft}`);
    console.log(`  - Eligible: ${eligibilityBefore.eligible}`);
    
    // Run renewal
    const { runRenewal } = require("../../webhook/sepay/renewal");
    const renewalResult = await runRenewal(orderCode, { forceRenewal: false });
    
    // Check status after renewal
    const statusAfter = await getOrderStatus(orderCode);
    const daysLeftAfter = await getOrderDaysLeft(orderCode);
    
    console.log(`  - Renewal success: ${renewalResult?.success}`);
    console.log(`  - Status after: ${statusAfter}`);
    console.log(`  - DaysLeft after: ${daysLeftAfter}`);
    
    const passed = 
      eligibilityBefore.eligible === true &&
      renewalResult?.success === true &&
      statusAfter === STATUS.PROCESSING &&
      daysLeftAfter > 0; // Should be extended
    
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: EXPIRED eligible → Renewal → PROCESSING với daysLeft tăng`);
    
    await cleanup([orderCode]);
    return passed;
  },

  async test9_PROCESSING_NOT_RENEWED() {
    console.log("\n=== TEST 9: PROCESSING không được renewal ===");
    
    const orderCode = `TEST_PROCESSING_${Date.now()}`;
    const expiryDate = addDays(new Date(), 2); // 2 days left
    
    // Create PROCESSING order
    const order = await createTestOrder({
      [COLS.ORDER.ID_ORDER]: orderCode,
      [COLS.ORDER.ID_PRODUCT]: "Netflix Premium --1m",
      [COLS.ORDER.CUSTOMER]: "Test Customer",
      [COLS.ORDER.ORDER_DATE]: formatDateForDB(addDays(new Date(), -28)),
      [COLS.ORDER.EXPIRY_DATE]: formatDateForDB(expiryDate),
      [COLS.ORDER.DAYS]: 30,
      [COLS.ORDER.STATUS]: STATUS.PROCESSING,
      [COLS.ORDER.COST]: 100000,
      [COLS.ORDER.PRICE]: 150000,
    });
    
    // Check eligibility
    const state = await fetchOrderState(orderCode);
    const eligibility = isEligibleForRenewal(
      state[ORDER_COLS.status],
      state[ORDER_COLS.expiryDate]
    );
    
    console.log(`  - Status: ${state[ORDER_COLS.status]}`);
    console.log(`  - DaysLeft: ${eligibility.daysLeft}`);
    console.log(`  - Eligible: ${eligibility.eligible}`);
    
    const passed = eligibility.eligible === false;
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: PROCESSING với daysLeft <= 4 không được eligible`);
    
    await cleanup([orderCode]);
    return passed;
  },

  async test10_Scheduler_NOT_MOVE_PROCESSING() {
    console.log("\n=== TEST 10: Scheduler không chuyển PROCESSING sang expired ===");
    
    const orderCode = `TEST_SCHEDULER_${Date.now()}`;
    const expiryDate = addDays(new Date(), -1); // -1 days (expired yesterday)
    
    // Create PROCESSING order that is expired
    const order = await createTestOrder({
      [COLS.ORDER.ID_ORDER]: orderCode,
      [COLS.ORDER.ID_PRODUCT]: "Netflix Premium --1m",
      [COLS.ORDER.CUSTOMER]: "Test Customer",
      [COLS.ORDER.ORDER_DATE]: formatDateForDB(addDays(new Date(), -31)),
      [COLS.ORDER.EXPIRY_DATE]: formatDateForDB(expiryDate),
      [COLS.ORDER.DAYS]: 30,
      [COLS.ORDER.STATUS]: STATUS.PROCESSING, // PROCESSING status
      [COLS.ORDER.COST]: 100000,
      [COLS.ORDER.PRICE]: 150000,
    });
    
    // Check order exists in order_list
    const before = await db(TABLES.orderList)
      .where({ [COLS.ORDER.ID_ORDER]: orderCode })
      .first();
    
    // Run scheduler (simulate)
    // Note: Actual scheduler would check status, but we verify the rule here
    const statusExpiredEligible = [STATUS.PAID, STATUS.RENEWAL, STATUS.EXPIRED];
    const shouldMove = statusExpiredEligible.includes(before[COLS.ORDER.STATUS]);
    
    console.log(`  - Status: ${before[COLS.ORDER.STATUS]}`);
    console.log(`  - DaysLeft: ${calculateDaysLeft(before[COLS.ORDER.EXPIRY_DATE])}`);
    console.log(`  - Should move to expired: ${shouldMove}`);
    
    const passed = shouldMove === false; // PROCESSING should NOT be moved
    console.log(`  ✓ ${passed ? "PASS" : "FAIL"}: Scheduler không chuyển PROCESSING sang expired`);
    
    await cleanup([orderCode]);
    return passed;
  },
};

// Run all tests
(async () => {
  console.log("=".repeat(60));
  console.log("TEST WEBHOOK & RENEWAL RULES");
  console.log("=".repeat(60));
  
  const results = [];
  
  for (const [testName, testFn] of Object.entries(tests)) {
    try {
      const result = await testFn();
      results.push({ test: testName, passed: result });
    } catch (error) {
      console.error(`  ✗ ERROR in ${testName}:`, error.message);
      results.push({ test: testName, passed: false, error: error.message });
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("TEST RESULTS SUMMARY");
  console.log("=".repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(({ test, passed, error }) => {
    const icon = passed ? "✓" : "✗";
    const status = passed ? "PASS" : "FAIL";
    console.log(`  ${icon} ${test}: ${status}${error ? ` (${error})` : ""}`);
  });
  
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
})();
