exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE system_automation.list_user
    DROP COLUMN IF EXISTS order_id;
  `);
};

exports.down = async function down(knex) {
  // Khôi phục tối thiểu: cột nullable + UNIQUE (không ép NOT NULL như bản gốc).
  await knex.raw(`
    ALTER TABLE system_automation.list_user
    ADD COLUMN IF NOT EXISTS order_id text UNIQUE;
  `);
};
