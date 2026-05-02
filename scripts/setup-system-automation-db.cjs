const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envFile = path.join(root, "env", "stack.backend.env");
const sqlFile = path.join(
  root,
  "schema",
  "system-automation",
  "sql",
  "000_system_automation_only.sql"
);

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return "";

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;

    const name = trimmed.slice(0, eqIndex).trim();
    if (name === key) {
      return trimmed.slice(eqIndex + 1).trim();
    }
  }

  return "";
}

const databaseUrl = process.env.DATABASE_URL || readEnvValue(envFile, "DATABASE_URL");
if (!databaseUrl) {
  console.error("[setup-system-automation-db] Missing DATABASE_URL.");
  process.exit(1);
}

const { Client } = require(path.join(root, "apps", "backend", "node_modules", "pg"));
const bcrypt = require(path.join(root, "apps", "backend", "node_modules", "bcryptjs"));

const defaultAdminUser =
  process.env.DEFAULT_ADMIN_USER || readEnvValue(envFile, "DEFAULT_ADMIN_USER");
const defaultAdminPass =
  process.env.DEFAULT_ADMIN_PASS || readEnvValue(envFile, "DEFAULT_ADMIN_PASS");

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(fs.readFileSync(sqlFile, "utf8"));

    const result = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('admin', 'system_automation')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);

    console.log("[setup-system-automation-db] Created tables:");
    for (const row of result.rows) {
      console.log(`- ${row.table_schema}.${row.table_name}`);
    }

    if (defaultAdminUser && defaultAdminPass) {
      const passwordHash = await bcrypt.hash(String(defaultAdminPass), 10);
      await client.query(
        `
          INSERT INTO admin.users (username, passwordhash, role)
          VALUES ($1, $2, 'admin')
          ON CONFLICT (username) DO UPDATE
          SET passwordhash = EXCLUDED.passwordhash,
              role = EXCLUDED.role
        `,
        [defaultAdminUser, passwordHash]
      );
      console.log(`[setup-system-automation-db] Seeded admin user: ${defaultAdminUser}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[setup-system-automation-db] Failed:", error.message);
  process.exit(1);
});
