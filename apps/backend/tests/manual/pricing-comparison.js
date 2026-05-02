/**
 * So sánh kết quả tính giá: generic tier-chain vs legacy if/else.
 * Chạy: node tests/manual/pricing-comparison.js
 *
 * Không cần DB — dùng FALLBACK_TIERS + mock data.
 */

const {
  calculateOrderPricingFromResolvedValues,
  normalizeMoney,
  calculateMarginBasedPrice,
  normalizeMarginRatio,
  normalizePromoRatio,
} = require("../../src/services/pricing/core");
const { FALLBACK_TIERS } = require("../../src/services/pricing/tierCache");

const roundToThousands = (v) => {
  const n = Math.round(v);
  if (!Number.isFinite(n) || n === 0) return 0;
  const r = n % 1000;
  if (r === 0) return n;
  return r >= 500 ? n + (1000 - r) : n - r;
};
const roundGiaBanValue = (v) => Math.floor(Number(v) + 0.5);
const roundPricingValue = (v) => Math.max(0, roundToThousands(roundGiaBanValue(v)));

function legacyCalculate(params) {
  const {
    orderId = "", customerType = "",
    pricingBase, importPrice,
    fallbackPrice = 0, fallbackCost = 0,
    pctCtv, pctKhach, pctPromo, pctStu,
    forceKhachLe = false,
  } = params;

  const resolve = (v, ...fb) => {
    if (Number.isFinite(v) && v > 0) return Math.round(v);
    for (const c of fb) { if (c != null) { const n = normalizeMoney(c); if (Number.isFinite(n) && n > 0) return n; } }
    return 0;
  };

  const base = resolve(pricingBase, importPrice, fallbackPrice, fallbackCost);
  const imp = resolve(importPrice, fallbackCost, base);
  const mCtv = normalizeMarginRatio(pctCtv, 0);
  const mKhach = normalizeMarginRatio(pctKhach, 0);
  const mPromo = normalizePromoRatio(pctPromo);
  const hasPctStu = pctStu !== null && pctStu !== undefined && !(typeof pctStu === "string" && String(pctStu).trim() === "");
  const mStu = hasPctStu ? normalizeMarginRatio(pctStu, 0) : mKhach;

  const resellRaw = calculateMarginBasedPrice(base, mCtv);
  const customerRaw = calculateMarginBasedPrice(resellRaw, mKhach);
  const studentRaw = calculateMarginBasedPrice(resellRaw, mStu);
  const resellPrice = roundPricingValue(resellRaw);
  const customerPrice = roundPricingValue(customerRaw);
  const baseCost = resolve(imp, fallbackCost, base);
  const studentPrice = roundPricingValue(studentRaw);

  const oid = String(orderId || "").trim().toUpperCase();
  const ct = String(customerType || "").trim().toUpperCase();
  const match = (p) => Boolean(p) && (oid.startsWith(p) || ct === p);

  const isCtv = match("MAVC");
  const isCustomer = match("MAVL");
  const isPromo = match("MAVK");
  const isGift = match("MAVT");
  const isImport = match("MAVN");
  const isStudent = match("MAVS");

  let price = customerPrice;
  if (forceKhachLe) price = customerPrice;
  else if (isStudent) price = studentPrice;
  else if (isCtv) price = resellPrice;
  else if (isCustomer) price = customerPrice;
  else if (isPromo) { const f = Math.max(0, 1 - mPromo); price = roundPricingValue(customerRaw * f); }
  else if (isGift) price = 0;
  else if (isImport) price = baseCost;

  return { price, cost: baseCost, resellPrice, customerPrice };
}

const TEST_CASES = [
  { name: "CTV order",          orderId: "MAVC001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: null },
  { name: "Customer order",     orderId: "MAVL001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: null },
  { name: "Promo order",        orderId: "MAVK001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0.2, pctStu: null },
  { name: "Student order",      orderId: "MAVS001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: 0.08 },
  { name: "Student (no pctStu)",orderId: "MAVS001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: null },
  { name: "Gift order",         orderId: "MAVT001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: null },
  { name: "Import order",       orderId: "MAVN001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: null, importPrice: 95000 },
  { name: "ForceKhachLe",       orderId: "MAVC001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: null, forceKhachLe: true },
  { name: "Zero margins",       orderId: "MAVC001",  pricingBase: 50000,  pctCtv: 0,    pctKhach: 0,    pctPromo: 0,   pctStu: null },
  { name: "High margins",       orderId: "MAVL001",  pricingBase: 200000, pctCtv: 0.15, pctKhach: 0.2,  pctPromo: 0.3, pctStu: 0.12 },
  { name: "Promo high disc",    orderId: "MAVK001",  pricingBase: 200000, pctCtv: 0.15, pctKhach: 0.2,  pctPromo: 0.5, pctStu: null },
  { name: "Unknown prefix",     orderId: "XXXX001",  pricingBase: 100000, pctCtv: 0.05, pctKhach: 0.1,  pctPromo: 0,   pctStu: null },
];

let passed = 0;
let failed = 0;

for (const tc of TEST_CASES) {
  const legacy = legacyCalculate(tc);
  const newResult = calculateOrderPricingFromResolvedValues({
    ...tc,
    _tiers: FALLBACK_TIERS,
    _prefixMap: { ctv: "MAVC", customer: "MAVL", promo: "MAVK", gift: "MAVT", import: "MAVN", student: "MAVS" },
  });

  const match =
    legacy.price === newResult.price &&
    legacy.cost === newResult.cost &&
    legacy.resellPrice === newResult.resellPrice &&
    legacy.customerPrice === newResult.customerPrice;

  if (match) {
    passed++;
    console.log(`  PASS  ${tc.name} → price=${legacy.price}`);
  } else {
    failed++;
    console.error(`  FAIL  ${tc.name}`);
    console.error(`    Legacy:  price=${legacy.price} cost=${legacy.cost} resell=${legacy.resellPrice} customer=${legacy.customerPrice}`);
    console.error(`    New:     price=${newResult.price} cost=${newResult.cost} resell=${newResult.resellPrice} customer=${newResult.customerPrice}`);
  }
}

console.log(`\n${passed}/${TEST_CASES.length} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
