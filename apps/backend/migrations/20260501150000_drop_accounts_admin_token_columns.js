/**
 * Bỏ access_token / token_expires — không còn dùng; session/cookie qua cookie_config.
 */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.accounts_admin
      DROP COLUMN IF EXISTS access_token,
      DROP COLUMN IF EXISTS token_expires;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS access_token text;
    ALTER TABLE system_automation.accounts_admin
      ADD COLUMN IF NOT EXISTS token_expires timestamptz;
  `);
};
