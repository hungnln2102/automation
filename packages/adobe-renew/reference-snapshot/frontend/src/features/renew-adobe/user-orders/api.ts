import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";
import type { OrderInfo } from "./types";

export function fetchRenewAdobeUserOrders(): Promise<OrderInfo[]> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_USER_ORDERS).then((res) => {
    if (!res.ok) {
      throw new Error("Lỗi tải user-orders");
    }

    return res.json() as Promise<OrderInfo[]>;
  });
}
