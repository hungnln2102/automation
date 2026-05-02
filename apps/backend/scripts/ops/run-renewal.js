/**
 * Chạy gia hạn thủ công cho một đơn (vd. đơn chỉ mới đổi status chưa chạy renewal).
 * Chạy từ thư mục backend: node scripts/run-renewal.js [ORDER_CODE]
 * Ví dụ: node scripts/run-renewal.js MAVLSP7RH
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const orderCode = process.argv[2] || "MAVLSP7RH";
const { runRenewal } = require("../webhook/sepay/renewal");

(async () => {
  console.log("Chạy gia hạn đơn:", orderCode, "(forceRenewal: true)\n");
  try {
    const result = await runRenewal(orderCode, { forceRenewal: true });
    console.log("Kết quả:", result?.success ? "OK" : "Lỗi/Bỏ qua");
    console.log(JSON.stringify(result, null, 2));
    process.exit(result?.success ? 0 : 1);
  } catch (err) {
    console.error("Lỗi:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
