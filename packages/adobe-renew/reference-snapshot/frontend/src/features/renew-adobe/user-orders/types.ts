import type { LicenseStatus } from "../types";

/** not_added = chưa gán admin; no_product = đã gán nhưng chưa cấp quyền Adobe */
export type DisplayStatus = LicenseStatus | "no_product" | "not_added";

export type UserOrderRow = {
  id: string;
  order_code: string;
  customer_name: string;
  email: string;
  profile: string;
  display_status: DisplayStatus;
  expiry: string;
  accountId: number;
};

export type OrderInfo = {
  order_code: string;
  information_order: string;
  customer: string;
  contact: string;
  expiry_date: string | null;
  status: string;
  tracking_org_name?: string | null;
  tracking_status?: string | null;
  tracking_id_product?: string | null;
  adobe_account_id?: number | null;
  admin_license_status?: string | null;
  admin_org_name?: string | null;
};
