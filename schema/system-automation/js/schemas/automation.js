const RENEW_ADOBE_SCHEMA = {
  ACCOUNT: {
    TABLE: "accounts_admin",
    COLS: {
      ID: "id",
      EMAIL: "email",
      PASSWORD_ENC: "password_encrypted",
      ADOBE_ORG_ID: "adobe_org_id",
      ORG_NAME: "org_name",
      LICENSE_STATUS: "license_status",
      USER_COUNT: "user_count",
      ALERT_CONFIG: "cookie_config",
      OTP_SOURCE: "otp_source",
      LAST_CHECKED: "last_checked_at",
      IS_ACTIVE: "is_active",
      CREATED_AT: "created_at",
      URL_ACCESS: "access_url",
      ID_PRODUCT: "id_product",
    },
  },
  LIST_USER: {
    TABLE: "list_user",
    COLS: {
      ID: "id",
      CUSTOMER: "customer",
      ACCOUNT: "account",
      ORG_NAME: "org_name",
      EXPIRED: "expired",
      STATUS: "status",
      ID_PRODUCT: "id_product",
      UPDATED_AT: "update_at",
    },
  },
};

module.exports = {
  RENEW_ADOBE_SCHEMA,
};
