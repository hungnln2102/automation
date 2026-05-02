const db = require("./knexClient");

const withTransaction = async (handler) => {
  const trx = await db.transaction();
  try {
    const result = await handler(trx);
    await trx.commit();
    return result;
  } catch (err) {
    await trx.rollback();
    throw err;
  }
};

module.exports = {
  db,
  withTransaction,
};
