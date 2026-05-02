exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
    DROP COLUMN IF EXISTS id_product;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
    ADD COLUMN IF NOT EXISTS id_product text;
  `);
};
