import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";
import { normalizeAdobeAdminAccount } from "../utils/accountUtils";

/**
 * Gọi job Renew Adobe giống lịch cron check-all qua API server.
 */
export function runSchedulerRenewAdobeCheck(): Promise<{ success: boolean }> {
  return apiFetch(API_ENDPOINTS.SCHEDULER_RUN_ADOBE_CHECK, { method: "GET" }).then(
    async (res) => {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };
      if (!res.ok) {
        throw new Error(
          data.error ||
            res.statusText ||
            "Không chạy được job (scheduler/run-adobe-check)."
        );
      }
      return { success: data.success === true };
    }
  );
}

export function fetchAdobeAdminAccounts() {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_ACCOUNTS)
    .then((res) => {
      if (!res.ok) {
        throw new Error(res.statusText || "Lỗi tải danh sách");
      }
      return res.json();
    })
    .then((rows: Record<string, unknown>[]) =>
      rows.map(normalizeAdobeAdminAccount)
    );
}

export function deleteAdobeAdminAccount(id: number): Promise<{ success: boolean; id: number }> {
  return apiFetch(
    API_ENDPOINTS.RENEW_ADOBE_ACCOUNT_DELETE(id),
    { method: "DELETE" }
  ).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      success?: boolean;
      id?: number;
    };
    if (!res.ok) {
      throw new Error(data.error || res.statusText || "Không xóa được tài khoản.");
    }
    return data as { success: boolean; id: number };
  });
}

export function createAdobeAdminAccount(payload: {
  email: string;
  password: string;
  otp_source?: "imap" | "tinyhost" | "hdsd" | "dongvan";
  otp_refresh_token?: string;
  otp_client_id?: string;
  otp_mail_email?: string;
}) {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_ACCOUNTS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.email.trim(),
      password: payload.password.trim(),
      ...(payload.otp_source ? { otp_source: payload.otp_source } : {}),
      ...(payload.otp_refresh_token
        ? { otp_refresh_token: payload.otp_refresh_token.trim() }
        : {}),
      ...(payload.otp_client_id ? { otp_client_id: payload.otp_client_id.trim() } : {}),
      ...(payload.otp_mail_email ? { otp_mail_email: payload.otp_mail_email.trim() } : {}),
    }),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      success?: boolean;
      id?: number;
    };
    if (!res.ok) {
      throw new Error(data.error || res.statusText || "Không thêm được tài khoản.");
    }
    return data;
  });
}

export function createAdobeAdminAccountsBulk(payload: {
  emails: string[];
  password: string;
  otp_source?: "imap" | "tinyhost" | "hdsd" | "dongvan";
  otp_refresh_token?: string;
  otp_client_id?: string;
  otp_mail_email?: string;
}): Promise<{
  success: boolean;
  created: { id: number; email: string }[];
  skipped: string[];
  invalid: string[];
}> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_ACCOUNTS_BULK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emails: payload.emails.map((email) => email.trim()).filter(Boolean),
      password: payload.password.trim(),
      ...(payload.otp_source ? { otp_source: payload.otp_source } : {}),
      ...(payload.otp_refresh_token
        ? { otp_refresh_token: payload.otp_refresh_token.trim() }
        : {}),
      ...(payload.otp_client_id ? { otp_client_id: payload.otp_client_id.trim() } : {}),
      ...(payload.otp_mail_email ? { otp_mail_email: payload.otp_mail_email.trim() } : {}),
    }),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      success?: boolean;
      created?: { id: number; email: string }[];
      skipped?: string[];
      invalid?: string[];
    };
    if (!res.ok) {
      throw new Error(data.error || res.statusText || "Không thêm được danh sách tài khoản.");
    }
    return {
      success: data.success === true,
      created: data.created ?? [],
      skipped: data.skipped ?? [],
      invalid: data.invalid ?? [],
    };
  });
}

export function updateAdobeAccount(
  id: number,
  payload: {
    email?: string;
    password_encrypted?: string;
    org_name?: string;
    otp_source?: "imap" | "tinyhost" | "hdsd" | "dongvan";
    otp_refresh_token?: string;
    otp_client_id?: string;
    otp_mail_email?: string;
  }
): Promise<{ success: boolean; account?: Record<string, unknown>; error?: string }> {
  return apiFetch(`${API_ENDPOINTS.RENEW_ADOBE_ACCOUNTS}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Cập nhật thất bại.");
    return data;
  });
}
