import { apiFetch } from "@/lib/api";
import type { StorefrontRenewStatusPayload } from "../types/storefrontRenew.types";

type ApiErrorShape = {
  success?: boolean;
  error?: string;
  message?: string;
};

function optionalPublicActivateHeaders(): Record<string, string> {
  const k = String(import.meta.env.VITE_RENEW_ADOBE_PUBLIC_API_KEY || "").trim();
  if (!k) return {};
  return { "X-Renew-Public-Key": k };
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function throwApiError(
  res: Response,
  data: ApiErrorShape | null,
  fallbackMessage: string,
): never {
  const message = data?.error || data?.message;
  if (message) {
    throw new Error(message);
  }
  throw new Error(!res.ok ? `HTTP ${res.status}` : fallbackMessage);
}

const STATUS_TIMEOUT_MS = 45_000;
const ACTIVATE_TIMEOUT_MS = 600_000;

export async function fetchStorefrontRenewStatus(
  email: string,
): Promise<StorefrontRenewStatusPayload> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await apiFetch(
      `/api/renew-adobe/public/status?email=${encodeURIComponent(email)}`,
      {
        credentials: "include",
        signal: controller.signal,
      },
    );
    const data =
      await readJsonSafe<StorefrontRenewStatusPayload & ApiErrorShape>(res);
    if (!res.ok || !data?.success) {
      throwApiError(
        res,
        data ?? null,
        "Không kiểm tra được profile. Vui lòng thử lại sau.",
      );
    }
    return data;
  } finally {
    clearTimeout(id);
  }
}

export async function activateStorefrontRenewProfile(
  email: string,
): Promise<StorefrontRenewStatusPayload> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ACTIVATE_TIMEOUT_MS);
  try {
    const pub = optionalPublicActivateHeaders();
    const res = await apiFetch(`/api/renew-adobe/public/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...pub,
      },
      credentials: "include",
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    const data =
      await readJsonSafe<StorefrontRenewStatusPayload & ApiErrorShape>(res);
    if (!res.ok || !data?.success) {
      throwApiError(
        res,
        data ?? null,
        "Không kích hoạt được profile. Vui lòng thử lại sau.",
      );
    }
    return data;
  } finally {
    clearTimeout(id);
  }
}
