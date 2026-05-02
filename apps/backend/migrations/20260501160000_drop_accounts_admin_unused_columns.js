/**
 * Bỏ cột không dùng: org_type, license_detail, mail_backup_id, users_snapshot.
 * OTP dùng env / otp_source; slot/license từ user_count + cookie_config.
 */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.accounts_admin
      DROP COLUMN IF EXISTS org_type,
      DROP COLUMN IF EXISTS license_detail,
      DROP COLUMN IF EXISTS mail_backup_id,
      DROP COLUMN IF EXISTS users_snapshot;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS org_type text;
    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS license_detail text;
    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS mail_backup_id integer;
    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS users_snapshot text;
  `);
};
