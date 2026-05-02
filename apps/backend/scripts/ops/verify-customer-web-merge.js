require("dotenv").config({ path: "./.env" });
const { Client } = require("pg");

const SQL = `
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('customer_info', 'customer_web')
  AND table_name IN (
    'customer_profiles',
    'customer_spend_stats',
    'customer_tiers',
    'customer_type_history'
  )
ORDER BY table_schema, table_name;
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(SQL);
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
