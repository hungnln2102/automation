export type LicenseStatus = "paid" | "active" | "expired" | "unknown";

export type MailBackupMailbox = {
  id: number;
  email: string;
  account_password_set: boolean;
  app_password_masked: string;
  note: string | null;
  provider: string;
  alias_prefix: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdobeAdminAccount = {
  id: number;
  email: string;
  password_encrypted: string;
  otp_source?: "imap" | "tinyhost" | "hdsd" | "dongvan";
  otp_refresh_token?: string | null;
  otp_client_id?: string | null;
  otp_mail_email?: string | null;
  mail_backup_id?: number | null;
  /** mail_backup.alias_prefix (OTP / Gmail +alias) */
  alias?: string | null;
  org_name: string | null;
  /** Số slot license (contract cap / y trong cột SLOT), đồng bộ meta snapshot */
  user_count: number;
  /** Số user trên Adobe đang có gói (x trong cột SLOT), cập nhật sau check/add */
  slot_used_count?: number;
  /** Số dòng order_user_tracking khớp org_name admin */
  tracking_user_count?: number;
  license_status: LicenseStatus;
  order_code?: string | null;
  last_checked_at?: string | null;
  access_url?: string | null;
  /** Adobe product id (CCP), ghi sau khi check thành công */
  id_product?: string | null;
};
