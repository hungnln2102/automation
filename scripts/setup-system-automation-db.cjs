const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const backendRoot = path.join(root, "apps", "backend");
const sqlFile = path.join(
  root,
  "schema",
  "system-automation",
  "sql",
  "000_system_automation_only.sql"
);

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;

    const name = trimmed.slice(0, eqIndex).trim();
    let val = trimmed.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[name] = val;
  }
  return out;
}

/** Khớp loadBackendEnv (dev): .env rồi .env.local ghi đè — không đọc env/ ở repo root. */
function mergedBackendEnvFromFiles() {
  const base = parseEnvFile(path.join(backendRoot, ".env"));
  const local = parseEnvFile(path.join(backendRoot, ".env.local"));
  return { ...base, ...local };
}

const fileEnv = mergedBackendEnvFromFiles();

const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "[setup-system-automation-db] Missing DATABASE_URL (env hoặc apps/backend/.env / .env.local)."
  );
  process.exit(1);
}

const { Client } = require(path.join(root, "apps", "backend", "node_modules", "pg"));
const bcrypt = require(path.join(root, "apps", "backend", "node_modules", "bcrypt"));

const defaultAdminUser =
  process.env.DEFAULT_ADMIN_USER || fileEnv.DEFAULT_ADMIN_USER;
const defaultAdminPass =
  process.env.DEFAULT_ADMIN_PASS || fileEnv.DEFAULT_ADMIN_PASS;

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
