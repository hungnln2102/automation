/**
 * Đổi màu danh mục đang là hex / rỗng sang linear-gradient (ngẫu nhiên, không trùng trong DB).
 * Giữ nguyên hàng đã có gradient.
 *
 * Chạy từ thư mục backend:
 *   npm run migrate:category-gradients
 * Xem trước không ghi DB:
 *   npm run migrate:category-gradients -- --dry-run
 */
const { db } = require("../src/db");
const {
  TABLES,
  categoryCols,
} = require("../src/controllers/ProductsController/constants");

function isGradientCssValue(color) {
  if (!color || typeof color !== "string") return false;
  return /^(linear|radial|conic)-gradient\(/i.test(color.trim());
}

function normalizeCategoryColorKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hsl(h, s, l) {
  return `hsl(${Math.round(h)} ${s}% ${l}%)`;
}

function generateRandomCategoryGradient() {
  const angle = 95 + Math.floor(Math.random() * 75);
  const h1 = Math.floor(Math.random() * 360);
  const h2 = (h1 + 28 + Math.floor(Math.random() * 80)) % 360;
  return `linear-gradient(${angle}deg, ${hsl(h1, 72, 54)}, ${hsl(h2, 68, 42)})`;
}

function generateUniqueGradient(takenSet) {
  for (let attempt = 0; attempt < 480; attempt += 1) {
    const g = generateRandomCategoryGradient();
    const k = normalizeCategoryColorKey(g);
    if (!takenSet.has(k)) {
      takenSet.add(k);
      return g;
    }
  }
  const salt = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let h = 0;
  for (let i = 0; i < salt.length; i += 1) h += salt.charCodeAt(i);
  h %= 360;
  const g = `linear-gradient(127deg, ${hsl(h, 70, 48)}, ${hsl(
    (h + 47) % 360,
    64,
    36
  )})`;
  takenSet.add(normalizeCategoryColorKey(g));
  return g;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const idCol = categoryCols.id;
  const nameCol = categoryCols.name;
  const colorCol = categoryCols.color;

  const rows = await db(TABLES.category)
    .select(idCol, nameCol, colorCol)
    .orderBy(idCol, "asc");

  const taken = new Set();
  for (const row of rows) {
    const c = row[colorCol];
    if (c && isGradientCssValue(c)) {
      taken.add(normalizeCategoryColorKey(c));
    }
  }

  const updates = [];
  for (const row of rows) {
    const id = row[idCol];
    const name = row[nameCol];
    const current = row[colorCol];
    if (current && isGradientCssValue(current)) continue;
    const next = generateUniqueGradient(taken);
    updates.push({ id, name, from: current || null, to: next });
  }

  if (updates.length === 0) {
    console.log("Không có dòng nào cần đổi (đã là gradient hết hoặc bảng rỗng).");
    await db.destroy();
    return;
  }

  console.log(
    dryRun ? `[dry-run] Sẽ cập nhật ${updates.length} danh mục:` : `Đang cập nhật ${updates.length} danh mục...`
  );
  for (const u of updates) {
    console.log(`  #${u.id} ${u.name}: ${u.from || "(trống)"} → ${u.to}`);
  }

  if (!dryRun) {
    await db.transaction(async (trx) => {
      for (const u of updates) {
        await trx(TABLES.category)
          .where(idCol, u.id)
          .update({ [colorCol]: u.to });
      }
    });
    console.log("Xong: đã ghi gradient vào cột color.");
  } else {
    console.log("[dry-run] Không ghi DB.");
  }

  await db.destroy();
}

main().catch(async (err) => {
  console.error("Lỗi migrate category gradients:", err);
  try {
    await db.destroy();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
