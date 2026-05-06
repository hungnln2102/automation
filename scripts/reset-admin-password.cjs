const bcrypt = require("../apps/backend/node_modules/bcrypt");
const { Client } = require("../apps/backend/node_modules/pg");

const username = process.argv[2] || "admin";
const password = process.argv[3];

if (!password) {
  console.error("Usage: node scripts/reset-admin-password.cjs <username> <password>");
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://admin_store_admin:admin_store_dev@127.0.0.1:5432/admin_store";

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(
      `
        UPDATE admin.users
        SET passwordhash = $1,
            role = 'admin'
        WHERE username = $2
        RETURNING userid, username, role, passwordhash LIKE '$2%' AS has_bcrypt_hash
      `,
      [passwordHash, username]
    );

    if (!result.rowCount) {
      throw new Error(`Admin user not found: ${username}`);
    }

    console.log(JSON.stringify(result.rows[0], null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
