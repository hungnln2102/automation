export const API_ENDPOINTS = {
  RENEW_ADOBE_ACCOUNTS: "/api/renew-adobe/accounts",
  RENEW_ADOBE_ACCOUNTS_BULK: "/api/renew-adobe/accounts/bulk",
  RENEW_ADOBE_ACCOUNT_DELETE: (id: number) => `/api/renew-adobe/accounts/${id}`,
  RENEW_ADOBE_ACCOUNT_CHECK: (id: number) =>
    `/api/renew-adobe/accounts/${id}/check`,
  RENEW_ADOBE_ACCOUNT_AUTO_DELETE_USERS: (id: number) =>
    `/api/renew-adobe/accounts/${id}/auto-delete-users`,
  RENEW_ADOBE_ACCOUNTS_ADD_USERS_BATCH: "/api/renew-adobe/accounts/add-users-batch",
  RENEW_ADOBE_CHECK_ALL: "/api/renew-adobe/accounts/check-all",
  SCHEDULER_RUN_ADOBE_CHECK: "/api/renew-adobe/accounts/check-all",
  RENEW_ADOBE_USER_ORDERS: "/api/renew-adobe/user-orders",
  RENEW_ADOBE_USER_ORDER_DELETE: (id: number) =>
    `/api/renew-adobe/user-orders/${id}`,
  RENEW_ADOBE_FIX_USER: "/api/renew-adobe/fix-user",
  RENEW_ADOBE_FIX_USERS_ROUND: "/api/renew-adobe/fix-users-round",
  RENEW_ADOBE_URL_ACCESS: (id: number) =>
    `/api/renew-adobe/accounts/${id}/url-access`,
  RENEW_ADOBE_MAIL_BACKUP: "/api/renew-adobe/mail-backup",
  RENEW_ADOBE_MAIL_BACKUP_ITEM: (id: number) => `/api/renew-adobe/mail-backup/${id}`,
  RENEW_ADOBE_MAIL_BACKUP_TEST: (id: number) => `/api/renew-adobe/mail-backup/${id}/test`,
  RENEW_ADOBE_PROXY_POOL: "/api/renew-adobe/proxy-pool",
  RENEW_ADOBE_PROXY_POOL_ITEM: (id: number) => `/api/renew-adobe/proxy-pool/${id}`,
  RENEW_ADOBE_PROXY_POOL_TEST: (id: number) => `/api/renew-adobe/proxy-pool/${id}/test`,
} as const;
