export const ORDER_STATUS = {
  UNPAID: "Chưa Thanh Toán",
  PROCESSING: "Đang Xử Lý",
  PAID: "Đã Thanh Toán",
  CANCELED: "Hủy",
  REFUNDED: "Đã Hoàn",
  PENDING_REFUND: "Chờ Hoàn",
  EXPIRED: "Hết Hạn",
  RENEWAL: "Cần Gia Hạn",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
