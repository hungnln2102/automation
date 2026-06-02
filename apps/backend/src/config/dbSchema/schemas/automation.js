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
      OTP_REFRESH_TOKEN: "otp_refresh_token",
      OTP_CLIENT_ID: "otp_client_id",
      OTP_MAIL_EMAIL: "otp_mail_email",
      MAIL_BACKUP_ID: "mail_backup_id",
      LAST_CHECKED: "last_checked_at",
      IS_ACTIVE: "is_active",
      CREATED_AT: "created_at",
      URL_ACCESS: "access_url",
      ID_PRODUCT: "id_product",
    },
  },
  ORDER_USER_TRACKING: {
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
      OTP_SOURCE: "otp_source",
      OTP_REFRESH_TOKEN: "otp_refresh_token",
      OTP_CLIENT_ID: "otp_client_id",
      OTP_MAIL_EMAIL: "otp_mail_email",
    },
  },
};

module.exports = {
  RENEW_ADOBE_SCHEMA,
};
