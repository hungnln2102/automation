// Test script để gửi thông báo đơn hết hạn
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const { sendZeroDaysRemainingNotification } = require("../../src/services/telegramOrderNotification");
const logger = require("../../src/utils/logger");

// Tạo dữ liệu test
const testOrders = [
  {
    id_order: "MAVCYTJ2A",
    idOrder: "MAVCYTJ2A",
    order_code: "MAVCYTJ2A",
    orderCode: "MAVCYTJ2A",
    customer: "KaioShin",
    customer_name: "KaioShin",
    id_product: "Netflix_Slot--1m",
    idProduct: "Netflix_Slot--1m",
    information_order: "hjkk@nomx.club",
    informationOrder: "hjkk@nomx.club",
    slot: "Uyên Phạm",
    registration_date_display: "31/12/2025",
    registration_date_str: "31/12/2025",
    order_date: "2025-12-31",
    days: 31,
    total_days: 31,
    expiry_date_display: new Date().toLocaleDateString("vi-VN"),
    expiry_date_str: new Date().toLocaleDateString("vi-VN"),
    expiry_date: new Date(),
    price: 65000,
  },
  {
    id_order: "TEST-002",
    idOrder: "TEST-002",
    order_code: "TEST-002",
    orderCode: "TEST-002",
    customer: "Khách hàng Test 2",
    customer_name: "Khách hàng Test 2",
    id_product: "Sản phẩm Test B",
    idProduct: "Sản phẩm Test B",
    information_order: "test2@example.com",
    informationOrder: "test2@example.com",
    slot: "Slot Test 2",
    registration_date_display: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString("vi-VN"),
    registration_date_str: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString("vi-VN"),
    order_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    days: 30,
    total_days: 30,
    expiry_date_display: new Date().toLocaleDateString("vi-VN"),
    expiry_date_str: new Date().toLocaleDateString("vi-VN"),
    expiry_date: new Date(),
    price: 100000,
  },
];

async function testZeroDaysNotification() {
  try {
    logger.info("[Test] Bắt đầu gửi thông báo đơn hết hạn test...");
    console.log("📤 Đang gửi thông báo test...");
    console.log(`📋 Số lượng đơn: ${testOrders.length}`);
    
    await sendZeroDaysRemainingNotification(testOrders);
    
    console.log("✅ Thông báo đã được gửi thành công!");
    console.log("📱 Kiểm tra Telegram topic ID: 2563 để xem thông báo");
    process.exit(0);
  } catch (error) {
    logger.error("[Test] Lỗi khi gửi thông báo", {
      error: error.message,
      stack: error.stack,
    });
    console.error("❌ Lỗi:", error.message);
    process.exit(1);
  }
}

testZeroDaysNotification();
