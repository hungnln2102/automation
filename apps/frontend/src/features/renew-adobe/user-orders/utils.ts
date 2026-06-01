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
  if (ts.includes("chưa add") || ts.includes("chua add")) return "not_added";
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
    // Join org_name có thể gán nhầm admin id dù user vẫn "chưa add" — không dùng cho xóa Adobe.
    const accountId = displayStatus === "not_added" ? 0 : aid;
    const orgTrack =
      order.tracking_org_name != null
        ? String(order.tracking_org_name).trim()
        : "";
    const orgAdmin =
      order.admin_org_name != null ? String(order.admin_org_name).trim() : "";
    const profile =
      (orgTrack && orgTrack) ||
      (aid > 0 && orgAdmin && orgAdmin) ||
      "—";

    const lid =
      order.list_user_id != null && String(order.list_user_id).trim() !== ""
        ? String(order.list_user_id).trim()
        : "";
    rows.push({
      id: lid ? `lu-${lid}` : aid > 0 ? `acc-${aid}-${email}` : `row-${email}`,
      listUserId: lid ? Number(lid) : null,
      customer_name: order.customer || "—",
      email,
      profile,
      display_status: displayStatus,
      expiry: order.expiry_date
        ? Helpers.formatDateToDMY(order.expiry_date)
        : "—",
      accountId: accountId,
    });
  }
  return rows;
}
