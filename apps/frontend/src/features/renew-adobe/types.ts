export type LicenseStatus = "paid" | "active" | "expired" | "unknown";

export type AdobeAdminAccount = {
  id: number;
  email: string;
  password_encrypted: string;
  otp_source?: "imap" | "tinyhost" | "hdsd";
  /** mail_backup.alias_prefix (OTP / Gmail +alias) */
  alias?: string | null;
  org_name: string | null;
  /** Số slot license (contract cap / y trong cột SLOT), đồng bộ meta snapshot */
  user_count: number;
  /** Số dòng order_user_tracking khớp org_name admin (x trong cột SLOT) */
  tracking_user_count?: number;
  license_status: LicenseStatus;
  order_code?: string | null;
  last_checked_at?: string | null;
  access_url?: string | null;
  /** Adobe product id (CCP), ghi sau khi check thành công */
  id_product?: string | null;
};
