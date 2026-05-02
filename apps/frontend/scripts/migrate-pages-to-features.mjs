/**
 * One-off: normalize relative imports to @/ after moving pages → features.
 * Run from frontend/: node scripts/migrate-pages-to-features.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "src");

const FEATURE_DIRS = [
  "features/dashboard",
  "features/orders",
  "features/package-product",
  "features/product-info",
  "features/form-info",
  "features/pricing",
  "features/supply",
  "features/product-price",
  "features/bill-order",
  "features/invoices",
  "features/warehouse",
  "features/ctv-list",
  "features/promo-codes",
  "features/add-mcoin",
  "features/active-keys",
  "features/product-system",
  "features/renew-adobe",
];

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, onFile);
    else if (/\.(tsx|ts|css)$/.test(ent.name)) onFile(p);
  }
}

function patchFile(filePath) {
  let s = fs.readFileSync(filePath, "utf8");
  const orig = s;

  const q = `["']`;

  // 6 levels up → src
  s = s.replace(
    new RegExp(`from (${q})\\.\\./\\.\\./\\.\\./\\.\\./\\.\\./\\.\\./(constants|lib|components|shared)`, "g"),
    "from $1@/$2"
  );
  // 5 levels
  s = s.replace(
    new RegExp(`from (${q})\\.\\./\\.\\./\\.\\./\\.\\./\\.\\./(constants|lib|components|shared)`, "g"),
    "from $1@/$2"
  );
  // 4 levels
  s = s.replace(
    new RegExp(`from (${q})\\.\\./\\.\\./\\.\\./\\.\\./(constants|lib|components|shared)`, "g"),
    "from $1@/$2"
  );
  // 3 levels
  s = s.replace(
    new RegExp(`from (${q})\\.\\./\\.\\./\\.\\./(constants|lib|components|shared)`, "g"),
    "from $1@/$2"
  );

  if (s !== orig) fs.writeFileSync(filePath, s, "utf8");
}

for (const rel of FEATURE_DIRS) {
  walk(path.join(SRC, rel), patchFile);
}

console.log("Patched relative imports in:", FEATURE_DIRS.join(", "));
