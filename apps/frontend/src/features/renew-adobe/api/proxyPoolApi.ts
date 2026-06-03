import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";
import type { AdminProxyItem } from "../types";

export function fetchAdminProxies(): Promise<AdminProxyItem[]> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_PROXY_POOL).then(async (res) => {
    const data = (await res.json().catch(() => [])) as AdminProxyItem[] | { error?: string };
    if (!res.ok) {
      throw new Error(
        !Array.isArray(data) && data.error ? data.error : "Tải danh sách proxy thất bại."
      );
    }
    return data as AdminProxyItem[];
  });
}

export function createAdminProxy(payload: {
  raw_line: string;
  label?: string;
  note?: string;
  is_default?: boolean;
}): Promise<AdminProxyItem> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_PROXY_POOL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as AdminProxyItem & { error?: string };
    if (!res.ok) throw new Error(data.error || "Thêm proxy thất bại.");
    return data;
  });
}

export function deleteAdminProxy(id: number): Promise<{ success: boolean; id: number }> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_PROXY_POOL_ITEM(id), {
    method: "DELETE",
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
    if (!res.ok) throw new Error(data.error || "Xóa proxy thất bại.");
    return { success: data.success === true, id };
  });
}

export function testAdminProxy(id: number): Promise<{
  ok: boolean;
  proxy_url_masked?: string;
  exit_ip?: string | null;
  message?: string;
  adobe_warning?: string | null;
}> {
  return apiFetch(API_ENDPOINTS.RENEW_ADOBE_PROXY_POOL_TEST(id)).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      proxy_url_masked?: string;
      exit_ip?: string | null;
      message?: string;
      adobe_warning?: string | null;
    };
    if (!res.ok || data.ok !== true) {
      throw new Error(data.error || "Test proxy thất bại.");
    }
    return {
      ok: true,
      proxy_url_masked: data.proxy_url_masked,
      exit_ip: data.exit_ip,
      message: data.message,
      adobe_warning: data.adobe_warning,
    };
  });
}
