import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";
import { normalizeAdobeAdminAccount } from "../utils/accountUtils";

export type MailBackupMailboxOption = {
  id: number;
  email: string;
  alias_prefix: string | null;
  note: string | null;
};

export function fetchRenewAdobeMailBackupMailboxes(options?: {
  /** Bỏ các hộp thư đã gán cho tài khoản admin (accounts_admin.mail_backup_id). */
  excludeAssigned?: boolean;
}): Promise<MailBackupMailboxOption[]> {
  const params = new URLSearchParams();
  if (options?.excludeAssigned) params.set("exclude_assigned", "1");
  const qs = params.toString();
  const url = `${API_ENDPOINTS.RENEW_ADOBE_MAIL_BACKUP_MAILBOXES}${
    qs ? `?${qs}` : ""
  }`;
  return apiFetch(url).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error?: string }).error === "string"
          ? (data as { error: string }).error
          : res.statusText || "Không tải được danh sách mail dự phòng.";
      throw new Error(msg);
    }
    if (!Array.isArray(data)) return [];
    return data as MailBackupMailboxOption[];
  });
}

export function createRenewAdobeMailBackupMailbox(payload: {
  alias_prefix: string;
  email?: string;
  app_password?: string;
  provider?: string;
  note?: string;
}): Promise<{ success: boolean; id: number; alias_prefix: string }> {
  return apiFetch(
    API_ENDPOINTS.RENEW_ADOBE_MAIL_BACKUP_MAILBOXES,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias_prefix: payload.alias_prefix.trim(),
        ...(payload.email?.trim() ? { email: payload.email.trim() } : {}),
        ...(payload.app_password?.trim()
          ? { app_password: payload.app_password.trim() }
          : {}),
        ...(payload.provider?.trim() ? { provider: payload.provider.trim() } : {}),
        ...(payload.note != null && String(payload.note).trim() !== ""
          ? { note: String(payload.note).trim() }
          : {}),
      }),
    }
  ).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      success?: boolean;
      id?: number;
      alias_prefix?: string;
    };
    if (!res.ok) {
      throw new Error(
        data.error || res.statusText || "Không tạo được hộp thư mail_backup."
      );
    }
    return data as { success: boolean; id: number; alias_prefix: string };
  });
}

/**
 * Gọi job Renew Adobe giống lịch cron (check all + auto-assign), qua API server.
 * Không chạy trong process `node scheduler.js` — dùng để so sánh hành vi với cron trên server.
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
  otp_source?: "imap" | "tinyhost" | "hdsd";
  mail_backup_id?: number | null;
}) {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_ACCOUNTS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.email.trim(),
      password: payload.password,
      ...(payload.otp_source ? { otp_source: payload.otp_source } : {}),
      ...(payload.mail_backup_id != null && payload.mail_backup_id > 0
        ? { mail_backup_id: payload.mail_backup_id }
        : {}),
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

export function updateAdobeAccount(
  id: number,
  payload: {
    email?: string;
    password_encrypted?: string;
    org_name?: string;
    otp_source?: "imap" | "tinyhost" | "hdsd";
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
