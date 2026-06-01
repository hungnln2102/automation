exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
      ADD COLUMN IF NOT EXISTS otp_mail_email text;

    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS otp_mail_email text;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
      DROP COLUMN IF EXISTS otp_mail_email;

    ALTER TABLE system_automation.accounts_admin
      DROP COLUMN IF EXISTS otp_mail_email;
  `);
};
