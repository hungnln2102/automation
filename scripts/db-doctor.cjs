const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const backendRoot = path.join(root, "apps", "backend");
const migrationsRoot = path.join(backendRoot, "migrations");
const sqlRoots = [
  path.join(backendRoot, "database", "migrations"),
  path.join(backendRoot, "database", "legacy_sql_migrations"),
];
const requiredBaselineFiles = ["000_initial_schema.sql"];

const existsInSqlRoots = (filename) =>
  sqlRoots.some((dir) => fs.existsSync(path.join(dir, filename)));

const migrationFiles = fs
  .readdirSync(migrationsRoot)
  .filter((name) => name.endsWith(".js"));

const referencedSql = new Set(requiredBaselineFiles);
for (const file of migrationFiles) {
  const body = fs.readFileSync(path.join(migrationsRoot, file), "utf8");
  for (const match of body.matchAll(/["']([^"']+\.sql)["']/g)) {
    referencedSql.add(match[1]);
  }
}

const missing = [...referencedSql].filter((file) => !existsInSqlRoots(file));

console.log("[db:doctor] backend:", backendRoot);
console.log("[db:doctor] migrations:", migrationFiles.length);
console.log("[db:doctor] referenced SQL files:", referencedSql.size);

if (missing.length) {
  console.error("[db:doctor] Missing SQL files:");
  for (const file of missing) console.error("  -", file);
  process.exit(1);
}

console.log("[db:doctor] OK - all referenced SQL files are present.");
