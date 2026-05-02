const { loadBackendEnv } = require("./src/config/loadEnv");

loadBackendEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "";

module.exports = {
  development: {
    client: "pg",
    connection: DATABASE_URL,
    pool: { min: 0, max: 5 },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
      schemaName: "public",
    },
    seeds: {
      directory: "./seeds",
    },
  },

  production: {
    client: "pg",
    connection: DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
      schemaName: "public",
    },
    seeds: {
      directory: "./seeds",
    },
  },
};
