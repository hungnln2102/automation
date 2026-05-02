/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Cùng giá trị `RENEW_ADOBE_PUBLIC_API_KEY` backend khi prod bật middleware kích hoạt public */
  readonly VITE_RENEW_ADOBE_PUBLIC_API_KEY?: string;
  /** Domain bổ sung (CSV) được coi như otp90 — form Renew chỉ không đăng nhập */
  readonly VITE_PUBLIC_RENEW_EXTRA_HOSTS?: string;
  readonly VITE_BANK_ID?: string;
  readonly VITE_BANK_NAME?: string;
  readonly VITE_BANK_ACCOUNT_NO?: string;
  readonly VITE_BANK_ACCOUNT_NAME?: string;
  readonly VITE_ORDER_QR_ACCOUNT_NUMBER?: string;
  readonly VITE_ORDER_QR_BANK_CODE?: string;
  readonly VITE_ORDER_QR_BANK_NAME?: string;
  readonly VITE_ORDER_QR_BANK_BIN?: string;
  readonly VITE_ORDER_QR_ACCOUNT_NAME?: string;
  readonly VITE_ORDER_QR_NOTE_PREFIX?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
