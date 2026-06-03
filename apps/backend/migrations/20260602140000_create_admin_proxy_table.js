/**
 * Bảng admin_proxy: pool proxy cho login Adobe admin.
 */
exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS system_automation.admin_proxy (
      id SERIAL PRIMARY KEY,
      label VARCHAR(255),
      proxy_url TEXT NOT NULL,
      note TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_alive BOOLEAN NOT NULL DEFAULT true,
      last_checked_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_admin_proxy_active_default
      ON system_automation.admin_proxy (is_active, is_default, is_alive);

    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS proxy_id integer
      REFERENCES system_automation.admin_proxy(id) ON DELETE SET NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.accounts_admin
      DROP COLUMN IF EXISTS proxy_id;

    DROP TABLE IF EXISTS system_automation.admin_proxy;
  `);
};
