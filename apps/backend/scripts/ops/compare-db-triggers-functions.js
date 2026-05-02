/**
 * So sánh danh sách trigger & function (theo schema nghiệp vụ) giữa hai kết nối Postgres.
 *
 * Usage:
 *   FRESH_URL="postgresql://..." MIGRATED_URL="postgresql://..." node scripts/ops/compare-db-triggers-functions.js
 *
 * If MIGRATED_URL omitted, uses DATABASE_URL from .env (backend root).
 */
const { Client } = require("pg");
const { loadBackendEnv } = require("../../src/config/loadEnv");

loadBackendEnv();

async function listTriggers(client) {
  const r = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY 1, 2, 3
  `);
  return r.rows.map((x) => `${x.schema_name}.${x.table_name}\t${x.trigger_name}`);
}

async function listFunctions(client) {
  const r = await client.query(`
    SELECT n.nspname AS schema_name, p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND NOT (n.nspname = 'public' AND p.proname = 'fips_mode')
    ORDER BY 1, 2, 3
  `);
  return r.rows.map(
    (x) =>
      `${x.schema_name}.${x.func_name}(${x.args || ""})`
  );
}

async function snapshot(url, label) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const triggers = await listTriggers(client);
    const functions = await listFunctions(client);
    return { label, triggers, functions };
  } finally {
    await client.end().catch(() => {});
  }
}

function diffSorted(a, b, name) {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyA = [...setA].filter((x) => !setB.has(x)).sort();
  const onlyB = [...setB].filter((x) => !setA.has(x)).sort();
  return { name, onlyA, onlyB };
}

async function main() {
  const freshUrl =
    process.env.FRESH_URL ||
    "postgresql://postgres:compare@127.0.0.1:55434/mystore";
  const migratedUrl = process.env.MIGRATED_URL || process.env.DATABASE_URL;
  if (!migratedUrl) {
    console.error("Missing MIGRATED_URL or DATABASE_URL");
    process.exitCode = 1;
    return;
  }

  console.log("Fresh:   ", freshUrl.replace(/:[^:@/]+@/, ":****@"));
  console.log("Migrated:", migratedUrl.replace(/:[^:@/]+@/, ":****@"));
  console.log("");

  const [fresh, migrated] = await Promise.all([
    snapshot(freshUrl, "fresh_docker"),
    snapshot(migratedUrl, "migrated"),
  ]);

  const trigDiff = diffSorted(fresh.triggers, migrated.triggers, "triggers");
  const funcDiff = diffSorted(fresh.functions, migrated.functions, "functions");

  console.log(
    `Counts — triggers: fresh=${fresh.triggers.length} migrated=${migrated.triggers.length} | functions: fresh=${fresh.functions.length} migrated=${migrated.functions.length}`
  );
  console.log("");

  for (const d of [trigDiff, funcDiff]) {
    if (d.onlyA.length === 0 && d.onlyB.length === 0) {
      console.log(`OK ${d.name}: identical sets`);
      continue;
    }
    console.log(`--- ${d.name}: only on FRESH (${d.onlyA.length}) ---`);
    d.onlyA.forEach((line) => console.log(line));
    console.log(`--- ${d.name}: only on MIGRATED (${d.onlyB.length}) ---`);
    d.onlyB.forEach((line) => console.log(line));
    console.log("");
  }

  if (trigDiff.onlyA.length || trigDiff.onlyB.length || funcDiff.onlyA.length || funcDiff.onlyB.length) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
