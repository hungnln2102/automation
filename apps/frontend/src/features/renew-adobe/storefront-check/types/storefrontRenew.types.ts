/** Payload public API `/api/renew-adobe/public/*`. */

export type StorefrontRenewStatusCode =
  | "active"
  | "needs_activation"
  | "order_expired"
  | "no_order";

export type RenewCheckResultKind =
  | "check-success"
  | "expired"
  | "outside-order"
  | "activate-success"
  | "error"
  | "info"
  | null;

export type StorefrontRenewOrderSnapshot = {
  orderCode: string | null;
  expiryDate: string | null;
  isExpired: boolean;
  status: string | null;
};

export type StorefrontRenewAccountSnapshot = {
  id: number;
  email: string | null;
  orgName: string | null;
  licenseStatus: string;
  userCount: number;
  isActive: boolean;
  userHasProduct: boolean | null;
  urlAccess?: string | null;
};

export type StorefrontRenewStatusPayload = {
  success: true;
  email: string;
  status: StorefrontRenewStatusCode;
  canActivate: boolean;
  profileName: string | null;
  message: string;
  order: StorefrontRenewOrderSnapshot | null;
  account: StorefrontRenewAccountSnapshot | null;
  activatedAccount?: {
    id: number;
    email: string;
  };
};
