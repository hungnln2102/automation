import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";
import type { MailBackupMailbox } from "../types";

export function fetchMailBackupMailboxes(): Promise<MailBackupMailbox[]> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_MAIL_BACKUP).then(async (res) => {
    const data = (await res.json().catch(() => [])) as MailBackupMailbox[] | { error?: string };
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error || res.statusText || "Không tải được mail IMAP."
      );
    }
    return Array.isArray(data) ? data : [];
  });
}

export function createMailBackupMailbox(payload: {
  raw_line?: string;
  email?: string;
  account_password?: string;
  app_password?: string;
  note?: string;
  provider?: string;
  alias_prefix?: string;
  is_default?: boolean;
}): Promise<MailBackupMailbox> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_MAIL_BACKUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as MailBackupMailbox & { error?: string };
    if (!res.ok) throw new Error(data.error || res.statusText || "Không thêm được mail IMAP.");
    return data;
  });
}

export function updateMailBackupMailbox(
  id: number,
  payload: Partial<{
    email: string;
    account_password: string;
    app_password: string;
    note: string;
    provider: string;
    alias_prefix: string;
    is_active: boolean;
    is_default: boolean;
  }>
): Promise<MailBackupMailbox> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_MAIL_BACKUP_ITEM(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as MailBackupMailbox & { error?: string };
    if (!res.ok) throw new Error(data.error || res.statusText || "Cập nhật thất bại.");
    return data;
  });
}

export function deleteMailBackupMailbox(id: number): Promise<{ success: boolean; id: number }> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_MAIL_BACKUP_ITEM(id), { method: "DELETE" }).then(
    async (res) => {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        id?: number;
      };
      if (!res.ok) throw new Error(data.error || res.statusText || "Không xóa được.");
      return data as { success: boolean; id: number };
    }
  );
}

export function testMailBackupMailbox(
  id: number
): Promise<{ ok: boolean; inbox_count?: number; error?: string }> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_MAIL_BACKUP_TEST(id)).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      inbox_count?: number;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || res.statusText || "Test IMAP thất bại.");
    return data as { ok: boolean; inbox_count?: number };
  });
}
