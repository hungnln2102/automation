function toNormalizedProductId(value) {
  return String(value || "").trim().toUpperCase();
}

/**
 * JIL org `/products` hay trả `id` là chỉ số dòng (1, 2, …), không phải mã fulfillable hex từ API (mỗi org khác nhau).
 */
function isImplicitSequenceProductId(value) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  return /^\d+$/.test(s) && s.length <= 12;
}

function firstFulfillableCodeFromArray(value) {
  if (!Array.isArray(value) || value.length === 0) return "";
  const first = value[0];
  if (typeof first === "string") return String(first).trim();
  if (first && typeof first === "object") {
    return String(
      first.fulfillableItemCode ||
        first.fulfillable_item_code ||
        first.productId ||
        first.product_id ||
        first.code ||
        first.id ||
        ""
    ).trim();
  }
  return "";
}

/**
 * Mã product để so khớp user.products / ABP với org `/products`:
 * - Ưu tiên `productId` (productAssignments).
 * - Rồi tới `id` hàng JIL (mã gói / arrangement, khớp productAssignments.productId), **trước** `offerId`.
 * - `offerId` chỉ fallback khi không có id hợp lệ; bỏ `id` dạng số thứ tự 1,2,… (internal).
 */
function extractProductId(item) {
  if (!item || typeof item !== "object") {
    return String(item || "").trim();
  }
  const nested = item.product && typeof item.product === "object" ? item.product : null;

  const explicitProductId = [
    item.productId,
    item.product_id,
    nested?.productId,
    nested?.product_id,
  ];
  for (const cand of explicitProductId) {
    if (cand == null || cand === "") continue;
    const s = String(cand).trim();
    if (s) return s;
  }

  const arrangementIds = [item.id, nested?.id];
  for (const cand of arrangementIds) {
    if (cand == null || cand === "") continue;
    const s = String(cand).trim();
    if (!s) continue;
    if (!isImplicitSequenceProductId(s)) return s;
  }

  const preferAfterArrangement = [
    item.primaryFulfillableItemCode,
    item.primary_fulfillable_item_code,
    item.fulfillableItemCode,
    item.fulfillable_item_code,
    firstFulfillableCodeFromArray(item.fulfillableItemCodes),
    firstFulfillableCodeFromArray(item.fulfillable_item_codes),
    item.offerId,
    item.offer_id,
    item.productCode,
    item.product_code,
    item.licensingArtifactProductId,
  ];

  for (const cand of preferAfterArrangement) {
    if (cand == null || cand === "") continue;
    const s = String(cand).trim();
    if (s) return s;
  }

  for (const cand of arrangementIds) {
    if (cand == null || cand === "") continue;
    const s = String(cand).trim();
    if (!s) continue;
    if (isImplicitSequenceProductId(s)) return s;
  }

  return "";
}

function normalizeProductName(value) {
  return String(value || "").trim().toLowerCase();
}

/** Gộp mọi trường hiển thị tên từ JIL/API để khớp / loại trừ gói. */
function combinedProductLabel(item) {
  if (!item || typeof item !== "object") return "";
  const parts = [
    item.longName,
    item.shortName,
    item.name,
    item.productName,
    item.displayName,
    item.title,
    item.offerName,
    item.localizedName,
    item.shortDisplayName,
    item.productArrangementDisplayName,
    item.offerDisplayName,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.join(" ").trim();
}

/**
 * Gói Member / thành viên miễn phí — không được tính là "còn gói" CCP.
 * Chỉ áp dụng khi có chuỗi tên (id-only không suy ra đây là Member).
 */
function isNonProMembershipProduct(item) {
  const n = normalizeProductName(combinedProductLabel(item));
  if (!n) return false;
  if (n.includes("miễn phí") || n.includes("mien phi")) return true;
  if (n.includes("gói thành viên") || n.includes("goi thanh vien")) return true;
  if (n.includes("thành viên miễn phí") || n.includes("thanh vien mien phi")) {
    return true;
  }
  if (n.includes("free membership")) return true;
  if (n.includes("free") && n.includes("member")) return true;
  if (n.includes("membership") && (n.includes("free") || n.includes("miễn phí"))) {
    return true;
  }
  return false;
}

function isCcpLikeName(value) {
  const name = normalizeProductName(value);
  if (!name) return false;
  if (isNonProMembershipProduct({ name: value, productName: "", displayName: "" })) {
    return false;
  }
  // Chỉ Creative Cloud Pro theo tên (id chứa CCP xử lý tại isCcpLikeProduct). Không dùng heuristic "all apps".
  return name.includes("creative cloud pro") || name.includes("creativecloudpro");
}

function isCcpLikeProduct(item) {
  if (!item || typeof item !== "object") return false;
  if (isNonProMembershipProduct(item)) return false;
  const rawId = toNormalizedProductId(extractProductId(item));
  if (rawId && rawId.includes("CCP")) return true;
  return isCcpLikeName(combinedProductLabel(item));
}

function extractProductIds(products) {
  if (!Array.isArray(products)) return [];
  return [
    ...new Set(
      products
        .map((item) => toNormalizedProductId(extractProductId(item)))
        .filter(Boolean)
    ),
  ];
}

function normalizeCcpProductIdList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value].filter((x) => x != null);
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const raw = x && typeof x === "object" ? extractProductId(x) : x;
    const id = toNormalizedProductId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Đọc danh sách product id CCP đã ghi nhận cho admin (lưu trong cookie_config / alert_config).
 */
function parseCcpProductIdsFromAlertConfig(raw) {
  if (raw == null) return [];
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return normalizeCcpProductIdList(obj.ccp_product_ids);
}

/**
 * Quyết định mảng id cần lưu sau check: ưu tiên giữ pin cũ; lần đầu hoặc force refresh thì ghi discovery.
 */
function computeCcpProductIdsToPersist({
  existingPinned = [],
  discovered = [],
  forceRefresh = false,
} = {}) {
  const ex = normalizeCcpProductIdList(existingPinned);
  const disc = normalizeCcpProductIdList(discovered);
  if (forceRefresh) {
    if (disc.length > 0) return disc;
    return ex;
  }
  if (ex.length > 0) return ex;
  return disc;
}

/**
 * Suy ra id gói CCP từ snapshot: chỉ khi product có tên Creative Cloud Pro / id chứa CCP.
 * Không suy từ tần suất id-only (gói Member không tên hay bị gán nhầm thành CCP).
 */
function discoverAdobeProProductIdSet(users, _adminEmail = "") {
  const list = Array.isArray(users) ? users : [];
  const ccpIds = new Set();
  for (const user of list) {
    const products = Array.isArray(user?.products) ? user.products : [];
    for (const product of products) {
      if (!isCcpLikeProduct(product)) continue;
      const id = toNormalizedProductId(extractProductId(product));
      if (id) ccpIds.add(id);
    }
  }

  return ccpIds;
}

/**
 * @param {string[]|undefined|null} pinnedProductIds - Nếu có phần tử, chỉ coi các id này là CCP (đã ghi nhận từ check trước).
 */
function inferAdobeProProductIdSet(users, adminEmail = "", pinnedProductIds) {
  const pinned = normalizeCcpProductIdList(pinnedProductIds);
  if (pinned.length > 0) {
    return new Set(pinned);
  }
  return discoverAdobeProProductIdSet(users, adminEmail);
}

function hasAdobeProAccessFromProducts(products, proProductIds, options = {}) {
  const authoritativeIdsOnly = options.authoritativeIdsOnly === true;
  const strictIdOnly = authoritativeIdsOnly || options.strictIdOnly === true;
  if (!Array.isArray(products) || products.length === 0) return false;
  const ids = proProductIds instanceof Set ? proProductIds : new Set(proProductIds || []);
  if (ids.size === 0) {
    return products.some((item) => isCcpLikeProduct(item));
  }
  return products.some((item) => {
    const pid = toNormalizedProductId(extractProductId(item));
    if (ids.has(pid)) {
      // Pin DB có thể cũ/sai: nếu API đã trả tên rõ là gói miễn phí/Member thì không tính là CCP.
      if (combinedProductLabel(item) && isNonProMembershipProduct(item)) return false;
      return true;
    }
    if (authoritativeIdsOnly) return false;
    return strictIdOnly ? false : isCcpLikeProduct(item);
  });
}

/**
 * Danh sách product id CCP seat từ API products org (đã có tên đầy đủ).
 */
function extractCcpSeatProductIdsFromOrgProductsList(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const p of arr) {
    if (!p || typeof p !== "object") continue;
    if (!isCcpLikeProduct(p)) continue;
    const id = toNormalizedProductId(extractProductId(p));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Ưu tiên id từ check products API (lần này) → pin DB → suy từ snapshot user (legacy).
 */
function resolveAuthoritativeCcpProductIdSet({
  verifiedFromProductsApi = [],
  pinnedProductIds = [],
  users = [],
  adminEmail = "",
} = {}) {
  const verified = normalizeCcpProductIdList(verifiedFromProductsApi);
  if (verified.length > 0) {
    return { idSet: new Set(verified), authoritativeOnly: true };
  }
  const pinned = normalizeCcpProductIdList(pinnedProductIds);
  if (pinned.length > 0) {
    return { idSet: new Set(pinned), authoritativeOnly: true };
  }
  return {
    idSet: inferAdobeProProductIdSet(users, adminEmail, []),
    authoritativeOnly: false,
  };
}

/**
 * Check user cụ thể đã được gán product Adobe Pro chưa.
 * Dùng users API snapshot làm nguồn sự thật.
 */
function checkUserAssignedProduct(users, email, adminEmail = "", pinnedProductIds, extra = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { assigned: false, matchedUser: null };
  }

  const list = Array.isArray(users) ? users : [];
  const { idSet, authoritativeOnly } = resolveAuthoritativeCcpProductIdSet({
    verifiedFromProductsApi: extra.verifiedCcpSeatProductIds,
    pinnedProductIds,
    users: list,
    adminEmail,
  });
  const matchedUser =
    list.find(
      (u) => String(u?.email || "").trim().toLowerCase() === normalizedEmail
    ) || null;

  if (!matchedUser) {
    return { assigned: false, matchedUser: null };
  }

  return {
    assigned: hasAdobeProAccessFromProducts(matchedUser.products, idSet, {
      strictIdOnly: authoritativeOnly,
      authoritativeIdsOnly: authoritativeOnly,
    }),
    matchedUser,
  };
}

/**
 * Check account/org còn gói hay hết gói dựa trên products list.
 */
function checkOrgLicenseCapacity(products = []) {
  const list = Array.isArray(products) ? products : [];

  const uniqueProductIds = [
    ...new Set(
      list.map((p) => toNormalizedProductId(extractProductId(p))).filter(Boolean)
    ),
  ];

  const creativeCloudProProducts = list.filter((p) => isCcpLikeProduct(p));

  const creativeCloudProProductIds = [
    ...new Set(
      creativeCloudProProducts
        .map((p) => toNormalizedProductId(extractProductId(p)))
        .filter(Boolean)
    ),
  ];

  const ccpTotals = creativeCloudProProducts
    .map((p) => Number(p?.total || 0))
    .filter((n) => Number.isFinite(n) && n > 0);

  // lisencecount dùng để giới hạn add-user; lấy theo gói Creative Cloud Pro.
  const contractActiveLicenseCount = ccpTotals.length ? Math.max(...ccpTotals) : 0;
  const hasActiveLicense = creativeCloudProProducts.length > 0;
  const licenseStatus = hasActiveLicense ? "Paid" : "Expired";

  return {
    contractActiveLicenseCount,
    licenseStatus,
    hasActiveLicense,
    productIdCount: uniqueProductIds.length,
    productIds: uniqueProductIds,
    creativeCloudProProductIds,
  };
}

module.exports = {
  checkUserAssignedProduct,
  checkOrgLicenseCapacity,
  inferAdobeProProductIdSet,
  discoverAdobeProProductIdSet,
  parseCcpProductIdsFromAlertConfig,
  normalizeCcpProductIdList,
  computeCcpProductIdsToPersist,
  hasAdobeProAccessFromProducts,
  isNonProMembershipProduct,
  isCcpLikeProduct,
  extractCcpSeatProductIdsFromOrgProductsList,
  resolveAuthoritativeCcpProductIdSet,
  /** Dùng B15 (removeProductAdminFlow) + test ABP; trích id gói từ object product/assignment. */
  extractProductId,
};
