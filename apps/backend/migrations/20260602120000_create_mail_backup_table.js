/**
 * Bảng mail_backup: lưu hộp thư IMAP (email + app password) — thay env/code cố định.
 */
exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS system_automation.mail_backup (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      account_password VARCHAR(255),
      app_password VARCHAR(255) NOT NULL,
      note TEXT,
      provider VARCHAR(64) NOT NULL DEFAULT 'gmail',
      alias_prefix VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_mail_backup_email_lower
      ON system_automation.mail_backup (lower(email));

    CREATE INDEX IF NOT EXISTS idx_mail_backup_active_default
      ON system_automation.mail_backup (is_active, is_default);

    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS mail_backup_id integer
      REFERENCES system_automation.mail_backup(id) ON DELETE SET NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.accounts_admin
      DROP COLUMN IF EXISTS mail_backup_id;

    DROP TABLE IF EXISTS system_automation.mail_backup;
  `);
};
