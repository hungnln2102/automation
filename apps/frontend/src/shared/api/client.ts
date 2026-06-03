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

  return "";
})();

function isBrowserLocalHostname(hostname: string): boolean {
  const h = hostname.replace(/^[|]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function normalizeBaseUrl(value: string): string {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  if (/^:\d+/.test(normalized)) return `http://localhost${normalized}`;
  if (/^localhost:\d+/.test(normalized)) return `http://${normalized}`;
  if (!/^https?:\/\//i.test(normalized)) return `http://${normalized}`;
  return normalized;
}

function isLoopbackDevApiBase(value: string): boolean {
  const normalized = normalizeBaseUrl((value || "").trim());
  if (!normalized) return false;
  try {
    const u = new URL(normalized);
    const h = u.hostname.replace(/^[|]$/g, "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(normalized);
  }
}

function sanitizeProductionRaw(raw: string): string {
  if (!isProdBundle) return raw;
  const t = raw.trim();
  if (t && isLoopbackDevApiBase(t)) return "";
  return t;
}

const RAW_API_AFTER_SANITIZE = sanitizeProductionRaw(RAW_API_BASE);
export const API_BASE_URL: string = normalizeBaseUrl(RAW_API_AFTER_SANITIZE);

function effectiveApiBase(): string {
  const base = API_BASE_URL;
  if (typeof window === "undefined") return base;
  const hostname = window.location.hostname;
  if (!isBrowserLocalHostname(hostname) && isLoopbackDevApiBase(base)) return "";
  return base;
}

let _csrfToken: string | null = null;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const buildUrl = (input: string): string => {
  if (input.startsWith("http")) return input;
  const base = effectiveApiBase().replace(/\/+$/, "");
  const path = input.replace(/^\/+/, "");
  return `${base}/${path}`;
};

function isMutatingMethod(method?: string): boolean {
  return MUTATING_METHODS.has((method || "GET").toUpperCase());
}

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

async function ensureCsrfToken(init?: RequestInit): Promise<void> {
  if (_csrfToken || !isMutatingMethod(init?.method)) return;

  const response = await fetch(buildUrl("/api/auth/csrf-token"), {
    method: "GET",
    credentials: init?.credentials ?? "include",
  });
  captureCsrfToken(response);
}

async function isCsrfErrorResponse(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const data = (await res.clone().json().catch(() => ({}))) as { code?: unknown };
    return typeof data.code === "string" && data.code.startsWith("CSRF_");
  } catch {
    return false;
  }
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

  await ensureCsrfToken(baseInit);

  const runFetch = async (requestUrl: string): Promise<Response> => {
    const response = await fetch(requestUrl, injectCsrfHeader(baseInit));
    captureCsrfToken(response);
    return response;
  };

  try {
    let res = await runFetch(url);

    if (isMutatingMethod(baseInit.method) && (await isCsrfErrorResponse(res))) {
      _csrfToken = null;
      await ensureCsrfToken(baseInit);
      res = await runFetch(url);
    }

    handleUnauthorized(input, res);
    return res;
  } catch (error) {
    const onLocalMachine =
      typeof window === "undefined" || isBrowserLocalHostname(window.location.hostname);

    if (isDev && onLocalMachine && !input.startsWith("http")) {
      const devApiOrigin = String((import.meta as any).env?.VITE_API_PROXY_TARGET || "")
        .trim()
        .replace(/\/+$/, "");
      const fallbackOrigin = devApiOrigin || "http://127.0.0.1:6000";
      const fallbackUrl = `${fallbackOrigin}/${input.replace(/^\/+/, "")}`;

      try {
        let res = await runFetch(fallbackUrl);
        if (isMutatingMethod(baseInit.method) && (await isCsrfErrorResponse(res))) {
          _csrfToken = null;
          await ensureCsrfToken(baseInit);
          res = await runFetch(fallbackUrl);
        }
        handleUnauthorized(input, res);
        return res;
      } catch {}

      try {
        let res = await runFetch(input);
        if (isMutatingMethod(baseInit.method) && (await isCsrfErrorResponse(res))) {
          _csrfToken = null;
          await ensureCsrfToken(baseInit);
          res = await runFetch(input);
        }
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