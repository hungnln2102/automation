exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
      ADD COLUMN IF NOT EXISTS otp_refresh_token text,
      ADD COLUMN IF NOT EXISTS otp_client_id text;

    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS otp_refresh_token text,
      ADD COLUMN IF NOT EXISTS otp_client_id text;

    ALTER TABLE system_automation.accounts_admin
      DROP CONSTRAINT IF EXISTS accounts_admin_otp_source_check;
    ALTER TABLE system_automation.accounts_admin
      ADD CONSTRAINT accounts_admin_otp_source_check
        CHECK (otp_source IN ('imap', 'tinyhost', 'hdsd', 'dongvan'));

    ALTER TABLE system_automation.list_user
      DROP CONSTRAINT IF EXISTS list_user_otp_source_check;
    ALTER TABLE system_automation.list_user
      ADD CONSTRAINT list_user_otp_source_check
        CHECK (otp_source IN ('imap', 'tinyhost', 'hdsd', 'dongvan'));
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
      DROP COLUMN IF EXISTS otp_refresh_token,
      DROP COLUMN IF EXISTS otp_client_id;

    ALTER TABLE system_automation.accounts_admin
      DROP COLUMN IF EXISTS otp_refresh_token,
      DROP COLUMN IF EXISTS otp_client_id;

    ALTER TABLE system_automation.accounts_admin
      DROP CONSTRAINT IF EXISTS accounts_admin_otp_source_check;
    ALTER TABLE system_automation.accounts_admin
      ADD CONSTRAINT accounts_admin_otp_source_check
        CHECK (otp_source IN ('imap', 'tinyhost', 'hdsd'));

    ALTER TABLE system_automation.list_user
      DROP CONSTRAINT IF EXISTS list_user_otp_source_check;
    ALTER TABLE system_automation.list_user
      ADD CONSTRAINT list_user_otp_source_check
        CHECK (otp_source IN ('imap', 'tinyhost', 'hdsd'));
  `);
};
