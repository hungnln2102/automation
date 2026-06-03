const IDENTITY_SCHEMA = {
  MAIL_BACKUP: {
    TABLE: "mail_backup",
    COLS: {
      ID: "id",
      EMAIL: "email",
      APP_PASSWORD: "app_password",
      NOTE: "note",
      PROVIDER: "provider",
      IS_ACTIVE: "is_active",
      CREATED_AT: "created_at",
      UPDATED_AT: "updated_at",
      ALIAS_PREFIX: "alias_prefix",
      ACCOUNT_PASSWORD: "account_password",
      IS_DEFAULT: "is_default",
    },
  },
  ADMIN_PROXY: {
    TABLE: "admin_proxy",
    COLS: {
      ID: "id",
      LABEL: "label",
      PROXY_URL: "proxy_url",
      NOTE: "note",
      IS_ACTIVE: "is_active",
      IS_DEFAULT: "is_default",
      IS_ALIVE: "is_alive",
      LAST_CHECKED_AT: "last_checked_at",
      LAST_ERROR: "last_error",
      CREATED_AT: "created_at",
      UPDATED_AT: "updated_at",
    },
  },
};

module.exports = {
  IDENTITY_SCHEMA,
};
