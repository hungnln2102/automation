import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";
import type { OrderInfo } from "./types";

export type CreateListUserPayload = {
  customer?: string | null;
  account: string;
  org_name?: string | null;
  expired?: string | null;
  status?: string | null;
  otp_source?: "tinyhost" | "hdsd" | "dongvan";
  otp_refresh_token?: string;
  otp_client_id?: string;
  otp_mail_email?: string;
  /** Gọi luồng gán Adobe (profile + API add user) sau khi lưu DB, bỏ qua kiểm tra login trong Playwright */
  assignAdobeNow?: boolean;
};

export function fetchRenewAdobeUserOrders(): Promise<OrderInfo[]> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_USER_ORDERS).then((res) => {
    if (!res.ok) {
      throw new Error("Lỗi tải user-orders");
    }

    return res.json() as Promise<OrderInfo[]>;
  });
}

export type CreateListUserResponse = {
  ok?: boolean;
  id?: number;
  updated?: boolean;
  message?: string;
  assignAdobe?: boolean;
  assign_error?: string;
  assign_already_linked?: boolean;
  assign_account_id?: number | null;
  assign_account_email?: string | null;
  assign_profile?: string | null;
};

export async function createRenewAdobeListUser(
  payload: CreateListUserPayload,
): Promise<CreateListUserResponse & { ok: boolean }> {
  const res = await apiFetch(API_ENDPOINTS.RENEW_ADOBE_USER_ORDERS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as CreateListUserResponse & {
    error?: string;
    ok?: boolean;
  };
  if (!res.ok) {
    throw new Error(data.error || "Không lưu được khách hàng.");
  }
  return { ok: !!data.ok, ...data };
}

export async function deleteRenewAdobeListUser(id: number): Promise<{ ok: boolean; id: number }> {
  const res = await apiFetch(API_ENDPOINTS.RENEW_ADOBE_USER_ORDER_DELETE(id), {
    method: "DELETE",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean; id?: number };
  if (!res.ok) {
    throw new Error(data.error || "Không xóa được user.");
  }
  return { ok: !!data.ok, id: Number(data.id) || id };
}
