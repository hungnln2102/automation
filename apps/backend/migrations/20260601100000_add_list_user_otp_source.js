exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
    ADD COLUMN IF NOT EXISTS otp_source text DEFAULT 'hdsd';

    ALTER TABLE system_automation.list_user
    DROP CONSTRAINT IF EXISTS list_user_otp_source_check;

    ALTER TABLE system_automation.list_user
    ADD CONSTRAINT list_user_otp_source_check
      CHECK (otp_source IN ('imap', 'tinyhost', 'hdsd'));
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
    DROP CONSTRAINT IF EXISTS list_user_otp_source_check;

    ALTER TABLE system_automation.list_user
    DROP COLUMN IF EXISTS otp_source;
  `);
};
