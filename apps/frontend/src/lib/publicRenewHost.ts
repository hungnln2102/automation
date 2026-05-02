/**
 * Domain phục vụ form Renew công khai (không qua đăng nhập admin).
 * Mặc định otp90.com + www; thêm qua VITE_PUBLIC_RENEW_EXTRA_HOSTS=a.com,b.test
 */
export function getPublicRenewHostnames(): string[] {
  const extra = String(
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_PUBLIC_RENEW_EXTRA_HOSTS as string) || ""
      : "",
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const defaults = ["otp90.com", "www.otp90.com"];
  return [...new Set([...defaults, ...extra])];
}

export function isPublicRenewHost(hostname?: string): boolean {
  if (typeof window === "undefined") return false;
  const h = String(hostname ?? window.location.hostname)
    .trim()
    .toLowerCase();
  return getPublicRenewHostnames().includes(h);
}
