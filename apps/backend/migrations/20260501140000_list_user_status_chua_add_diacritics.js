exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE system_automation.list_user
    SET status = 'chưa add'
    WHERE status = 'chua add';

    ALTER TABLE system_automation.list_user
    ALTER COLUMN status SET DEFAULT 'chưa add';
  `);
};

exports.down = async function down() {
  // Không revert: đổi ngược sang 'chua add' có thể vi phạm CHECK trên DB đã merge constraint.
};
