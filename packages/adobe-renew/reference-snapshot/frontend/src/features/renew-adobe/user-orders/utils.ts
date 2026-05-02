import * as Helpers from "@/lib/helpers";
import type { LicenseStatus } from "../types";
import { normalizeIncomingLicenseStatus } from "../utils/accountUtils";
import type { DisplayStatus, OrderInfo, UserOrderRow } from "./types";

/**
 * Chỉ true khi scrape báo rõ user đã có product (cột Sản phẩm trên Adobe).
 * null/undefined/chuỗi rỗng → không kế thừa license của admin (tránh "Còn gói" sai).
 */
export function userHasAssignedProduct(
  userProduct: boolean | string | number | undefined | null
): boolean {
  if (userProduct === true) return true;
  if (typeof userProduct === "number") return userProduct === 1;
  if (typeof userProduct === "string") {
    const n = userProduct.trim().toLowerCase();
    return (
      n === "true" ||
      n === "1" ||
      n === "yes" ||
      n.includes("ccp") ||
      n.includes("creative cloud pro") ||
      n.includes("creativecloudpro") ||
      n.includes("all apps") ||
      n.includes("all-app") ||
      n.includes("all app")
    );
  }
  return false;
}

export function resolveDisplayStatus(
  userProduct: boolean | string | number | undefined | null,
  accountLicenseStatus: LicenseStatus
): DisplayStatus {
  if (!userHasAssignedProduct(userProduct)) {
    return "no_product";
  }

  return accountLicenseStatus;
}

export function buildEmailOrderMap(
  orders: OrderInfo[]
): Map<string, OrderInfo> {
  const map = new Map<string, OrderInfo>();

  for (const order of orders) {
    const email = (order.information_order || "").trim().toLowerCase();
    if (email && !map.has(email)) {
      map.set(email, order);
    }
  }

  return map;
}

/** Trạng thái hiển thị từ order_user_tracking + admin (API user-orders đã join). */
function displayStatusFromOrder(order: OrderInfo): DisplayStatus {
  const aid = Number(order.adobe_account_id) || 0;
  if (aid <= 0) return "not_added";
  const ts = (order.tracking_status || "").trim().toLowerCase();
  if (ts.includes("chưa cấp")) return "no_product";
  if (ts.includes("chưa add")) return "not_added";
  if (ts.includes("có gói")) {
    return normalizeIncomingLicenseStatus(order.admin_license_status);
  }
  return "not_added";
}

export function flattenToUserRows(orders: OrderInfo[]): UserOrderRow[] {
  const rows: UserOrderRow[] = [];
  for (const order of orders) {
    const email = (order.information_order || "").trim().toLowerCase();
    if (!email) continue;
    const aid = Number(order.adobe_account_id) || 0;
    const displayStatus = displayStatusFromOrder(order);
    const profile =
      displayStatus === "not_added"
        ? "—"
        : (order.tracking_org_name != null &&
            String(order.tracking_org_name).trim() !== "" &&
            String(order.tracking_org_name).trim()) ||
          (order.admin_org_name != null &&
            String(order.admin_org_name).trim() !== "" &&
            String(order.admin_org_name).trim()) ||
          "—";

    rows.push({
      id: aid > 0 ? `acc-${aid}-${email}` : `order-${email}`,
      order_code: order.order_code ?? "—",
      customer_name: order.customer || "—",
      email,
      profile,
      display_status: displayStatus,
      expiry: order.expiry_date
        ? Helpers.formatDateToDMY(order.expiry_date)
        : "—",
      accountId: aid,
    });
  }
  return rows;
}
