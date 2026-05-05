const isDev =
  typeof import.meta !== "undefined" && (import.meta as any).env?.DEV === true;

const isProdBundle =
  typeof import.meta !== "undefined" && (import.meta as any).env?.PROD === true;

const RAW_API_BASE: string = (() => {
  if (isDev) return "";

  const metaBase =
    typeof import.meta !== "undefined"
      ? ((import.meta as any).env?.VITE_API_BASE_URL as string) || ""
      : "";
  if (metaBase) return metaBase;

  const envBase =
    typeof process !== "undefined"
      ? ((process as any).env?.VITE_API_BASE_URL as string) || ""
      : "";
  if (envBase) return envBase;

  // Build production: để trống → `/api/...` cùng origin (Nginx path proxy).
  // Hoặc set VITE_API_BASE_URL=https://api.otp90.com khi API ở subdomain riêng.
  return "";
})();

function looksLikeLocalDevHost(raw: string): boolean {
  return /localhost|127\.0\.0\.1/i.test((raw || "").trim());
}

/** Build-time: không cho bundle production “dính” máy dev nếu .env sai. */
function sanitizeProductionRaw(raw: string): string {
  if (!isProdBundle) return raw;
  const t = raw.trim();
  if (t && looksLikeLocalDevHost(t)) return "";
  return t;
}

const RAW_API_AFTER_SANITIZE = sanitizeProductionRaw(RAW_API_BASE);

function normalizeBaseUrl(value: string): string {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  if (/^:\d+/.test(normalized)) return `http://localhost${normalized}`;
  if (/^localhost:\d+/.test(normalized)) return `http://${normalized}`;
  if (!/^https?:\/\//i.test(normalized)) return `http://${normalized}`;
  return normalized;
}

export const API_BASE_URL: string = normalizeBaseUrl(RAW_API_AFTER_SANITIZE);

/** Base có hiệu lực trên browser: không bao giờ gọi localhost khi đang vào domain thật. */
function effectiveApiBase(): string {
  const base = API_BASE_URL;
  if (typeof window === "undefined") return base;
  const hostname = window.location.hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    if (looksLikeLocalDevHost(base)) return "";
  }
  return base;
}

let _csrfToken: string | null = null;

const buildUrl = (input: string): string => {
  if (input.startsWith("http")) return input;
  const base = effectiveApiBase().replace(/\/+$/, "");
  const path = input.replace(/^\/+/, "");
  return `${base}/${path}`;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function injectCsrfHeader(init: RequestInit): RequestInit {
  const method = (init.method || "GET").toUpperCase();
  if (!_csrfToken || !MUTATING_METHODS.has(method)) return init;

  const headers = new Headers(init.headers);
  if (!headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", _csrfToken);
  }
  return { ...init, headers };
}

function captureCsrfToken(res: Response): void {
  const token = res.headers.get("X-CSRF-Token");
  if (token) _csrfToken = token;
}

function handleUnauthorized(input: string, res: Response): void {
  if (res.status !== 401) return;
  if (/\/auth\/(login|me|csrf-token)/i.test(input)) return;
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const url = buildUrl(input);
  const baseInit: RequestInit = {
    credentials: init?.credentials ?? "include",
    ...init,
  };
  const finalInit = injectCsrfHeader(baseInit);

  try {
    const res = await fetch(url, finalInit);
    captureCsrfToken(res);
    handleUnauthorized(input, res);
    return res;
  } catch (error) {
    const onLocalMachine =
      typeof window === "undefined" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    // Chỉ retry backend cục bộ khi chạy Vite dev thật sự trên máy dev, không khi SPA dev lỗi trên domain public.
    if (isDev && onLocalMachine && !input.startsWith("http")) {
      try {
        const res = await fetch(`http://127.0.0.1:3001/${input.replace(/^\/+/, "")}`, finalInit);
        captureCsrfToken(res);
        handleUnauthorized(input, res);
        return res;
      } catch {}

      try {
        const res = await fetch(input, finalInit);
        captureCsrfToken(res);
        handleUnauthorized(input, res);
        return res;
      } catch {}
    }

    throw error as Error;
  }
}

export async function apiRequest<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {}
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json();
}

export const apiGet = <T = unknown>(url: string): Promise<T> =>
  apiRequest<T>(url);

export const apiPost = <T = unknown>(url: string, data?: unknown): Promise<T> =>
  apiRequest<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data != null ? JSON.stringify(data) : undefined,
  });

export const apiPut = <T = unknown>(url: string, data?: unknown): Promise<T> =>
  apiRequest<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: data != null ? JSON.stringify(data) : undefined,
  });

export const apiPatch = <T = unknown>(url: string, data?: unknown): Promise<T> =>
  apiRequest<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: data != null ? JSON.stringify(data) : undefined,
  });

export const apiDelete = <T = unknown>(url: string): Promise<T> =>
  apiRequest<T>(url, { method: "DELETE" });
