const fs = require("fs");
const path = require("path");

const resolveSharedStatuses = () => {
  const candidates = [
    path.resolve(__dirname, "../../../shared/orderStatuses.cjs"),
    path.resolve(__dirname, "../../shared/orderStatuses.cjs"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate).ORDER_STATUS;
    }
  }

  return null;
};

const FALLBACK_STATUSES = {
  UNPAID: "Chưa Thanh Toán",
  PROCESSING: "Đang Xử Lý",
  PAID: "Đã Thanh Toán",
  CANCELED: "Hủy",
  REFUNDED: "Đã Hoàn",
  PENDING_REFUND: "Chưa Hoàn",
  EXPIRED: "Hết Hạn",
  RENEWAL: "Cần Gia Hạn",
};

const ORDER_STATUS = resolveSharedStatuses() || FALLBACK_STATUSES;

const STATUS = ORDER_STATUS;

module.exports = {
  STATUS,
};
