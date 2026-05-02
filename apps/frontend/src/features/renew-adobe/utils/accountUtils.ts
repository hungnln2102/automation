import type { AdobeAdminAccount, LicenseStatus } from "../types";

/** Chuẩn hóa trạng thái gói từ API/SSE (DB có thể là Paid, paid, …). */
export function normalizeIncomingLicenseStatus(raw: unknown): LicenseStatus {
  const status = String(raw ?? "unknown").toLowerCase();
  if (status === "paid") return "paid";
  if (status === "active") return "active";
  if (status === "expired") return "expired";
  return "unknown";
}

export function maskPassword(_raw: string): string {
  return "••••••••";
}

export function hasNoAccountInfo(account: AdobeAdminAccount): boolean {
  const orgName = (account.org_name ?? "").toString().trim();
  return orgName === "" || orgName === "—" || orgName === "-";
}

export function normalizeAdobeAdminAccount(
  row: Record<string, unknown>
): AdobeAdminAccount {
  const licenseStatus = normalizeIncomingLicenseStatus(row.license_status);

  const aliasRaw = row.alias;
  const rawOtpSource = String(row.otp_source ?? "imap").trim().toLowerCase();
  const otpSource: "imap" | "tinyhost" | "hdsd" =
    rawOtpSource === "tinyhost" || rawOtpSource === "hdsd"
      ? rawOtpSource
      : "imap";
  return {
    id: Number(row.id) || 0,
    email: String(row.email ?? ""),
    password_encrypted: String(row.password_encrypted ?? row.password_enc ?? ""),
    otp_source: otpSource,
    alias:
      aliasRaw != null && String(aliasRaw).trim() !== ""
        ? String(aliasRaw).trim()
        : null,
    org_name: row.org_name != null ? String(row.org_name) : null,
    user_count: Number(row.user_count) ?? 0,
    tracking_user_count:
      row.tracking_user_count != null &&
      Number.isFinite(Number(row.tracking_user_count))
        ? Number(row.tracking_user_count)
        : 0,
    license_status: licenseStatus,
    order_code: row.order_code != null ? String(row.order_code) : null,
    last_checked_at: row.last_checked_at != null ? String(row.last_checked_at) : null,
    access_url: row.access_url != null ? String(row.access_url) : null,
    id_product:
      row.id_product != null && String(row.id_product).trim() !== ""
        ? String(row.id_product).trim()
        : null,
  };
}
