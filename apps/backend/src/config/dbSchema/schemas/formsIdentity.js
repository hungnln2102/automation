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
    },
  },
};

module.exports = {
  IDENTITY_SCHEMA,
};
