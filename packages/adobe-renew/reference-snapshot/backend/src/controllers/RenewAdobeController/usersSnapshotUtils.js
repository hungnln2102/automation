function toNonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Phần tử đầu snapshot: gom lisencecount + products (không có email user). */
function isSnapshotMetaRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const email = String(row.email ?? "").trim();
  if (email) return false;
  const hasLc =
    row.lisencecount != null ||
    row.licensecount != null ||
    row.licenseCount != null;
  const hasProductsKey = Object.prototype.hasOwnProperty.call(row, "products");
  return hasLc || hasProductsKey;
}

function parseSnapshotArray(rawValue) {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

/**
 * Chỉ các dòng user (bỏ phần tử meta đầu nếu có).
 */
function parseUsersSnapshot(rawValue) {
  const full = parseSnapshotArray(rawValue);
  if (full.length === 0) return [];
  if (isSnapshotMetaRow(full[0])) return full.slice(1);
  return full;
}

function parseObject(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue === "object" && !Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * Đọc số slot license (contract cap) từ API/scrape, meta snapshot hoặc cookie.
 * Khi persist DB, dùng {@link userCountDbValue} → cột `accounts_admin.user_count` (không còn cột riêng).
 */
function resolveLisenceCount({ explicit = null, usersSnapshot = null, alertConfig = null } = {}) {
  const direct = toNonNegativeNumber(explicit);
  if (direct != null) return direct;

  if (usersSnapshot != null) {
    let rows = [];
    if (typeof usersSnapshot === "string" && usersSnapshot.trim()) {
      rows = parseSnapshotArray(usersSnapshot);
    } else if (Array.isArray(usersSnapshot)) {
      rows = usersSnapshot;
    }
    if (rows.length > 0 && isSnapshotMetaRow(rows[0])) {
      const fromMeta = toNonNegativeNumber(
        rows[0].lisencecount ?? rows[0].licensecount ?? rows[0].licenseCount
      );
      if (fromMeta != null) return fromMeta;
    }
    const members = rows.length > 0 && isSnapshotMetaRow(rows[0]) ? rows.slice(1) : rows;
    for (const user of members) {
      const fromSnapshot = toNonNegativeNumber(
        user?.lisencecount ?? user?.licensecount ?? user?.licenseCount
      );
      if (fromSnapshot != null) return fromSnapshot;
    }
  }

  const alertObj = parseObject(alertConfig);
  const fromAlert = toNonNegativeNumber(
    alertObj?.contractActiveLicenseCount ??
      alertObj?.lisencecount ??
      alertObj?.licensecount ??
      alertObj?.licenseCount
  );
  if (fromAlert != null) return fromAlert;

  return null;
}

/**
 * Giới hạn slot (license cap): ưu tiên cột user_count; fallback meta snapshot / cookie.
 */
function resolveAccountSeatLimit(account) {
  const fromDb = toNonNegativeNumber(account?.user_count);
  if (fromDb != null && fromDb > 0) return fromDb;
  return resolveLisenceCount({
    usersSnapshot: account?.users_snapshot,
    alertConfig: account?.cookie_config ?? account?.alert_config,
  });
}

/**
 * @param {object} account
 * @param {number} [maxFallback=10]
 */
function resolveAccountUserLimit(account, maxFallback = 10) {
  const cap = resolveAccountSeatLimit(account);
  const n = cap != null ? Number(cap) : 0;
  if (Number.isFinite(n) && n > 0) return n;
  return maxFallback;
}

/**
 * Giá trị ghi vào `accounts_admin.user_count` sau khi đã có license count (hoặc tương đương).
 * Ưu tiên cap từ contract; chỉ fallback sang số user team khi chưa resolve được slot.
 */
function userCountDbValue(licenseCap, fallbackTeamCount) {
  const lc = toNonNegativeNumber(licenseCap);
  if (lc != null && lc > 0) return lc;
  const fb = toNonNegativeNumber(fallbackTeamCount);
  return fb ?? 0;
}

function normalizeSnapshotProducts(input) {
  if (input == null) return null;
  if (Array.isArray(input)) {
    const out = input
      .map((p) => {
        if (p && typeof p === "object" && p.id != null && String(p.id).trim() !== "") {
          return { id: String(p.id).trim() };
        }
        if (typeof p === "string" && p.trim()) return { id: p.trim() };
        return null;
      })
      .filter(Boolean);
    return out.length ? out : null;
  }
  if (typeof input === "string") {
    const parts = input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return null;
    return parts.map((id) => ({ id }));
  }
  return null;
}

/**
 * Snapshot: [ { lisencecount, products? }, ...users ] — không lặp lisencecount trên từng user.
 * @param {object[]} users
 * @param {number|null|undefined} lisencecount
 * @param {Array<{id:string}>|string|null} [snapshotProducts] — object hoặc CSV id_product
 */
function attachLisenceCount(users, lisencecount, snapshotProducts = null) {
  const list = Array.isArray(users) ? users : [];
  const normalized = toNonNegativeNumber(lisencecount);
  const productsArr = normalizeSnapshotProducts(snapshotProducts);

  const cleaned = list.map((user) => {
    if (!user || typeof user !== "object") return user;
    const { lisencecount: _a, licensecount: _b, licenseCount: _c, ...rest } = user;
    return rest;
  });

  const meta = {};
  if (normalized != null) meta.lisencecount = normalized;
  if (productsArr && productsArr.length > 0) meta.products = productsArr;

  if (Object.keys(meta).length === 0) return cleaned;
  return [meta, ...cleaned];
}

/**
 * Luồng V2 sau add/delete chỉ persist `{ cookies }`. Ghép với config DB hiện tại
 * để không mất contractActiveLicenseCount (tránh fallback MAX_USERS_PER_ACCOUNT).
 */
function mergeRenewAdobeAlertConfig(existingRaw, incomingRaw, usersSnapshotRaw = null) {
  const existing = parseObject(existingRaw) || {};
  let incoming = parseObject(incomingRaw);
  if (incoming == null && Array.isArray(incomingRaw)) {
    incoming = { cookies: incomingRaw };
  }
  incoming = incoming || {};
  if (Object.keys(incoming).length === 0) {
    return existingRaw ?? null;
  }

  const merged = { ...existing, ...incoming };
  let license = resolveLisenceCount({ alertConfig: merged });
  if (license == null) {
    const fromExisting = resolveLisenceCount({ alertConfig: existing });
    if (fromExisting != null) {
      merged.contractActiveLicenseCount = fromExisting;
      license = fromExisting;
    }
  }
  if (license == null && usersSnapshotRaw != null) {
    const fromUsers = resolveLisenceCount({ usersSnapshot: usersSnapshotRaw });
    if (fromUsers != null) {
      merged.contractActiveLicenseCount = fromUsers;
    }
  }
  return merged;
}

module.exports = {
  parseSnapshotArray,
  parseUsersSnapshot,
  isSnapshotMetaRow,
  resolveLisenceCount,
  resolveAccountSeatLimit,
  resolveAccountUserLimit,
  userCountDbValue,
  attachLisenceCount,
  mergeRenewAdobeAlertConfig,
  normalizeSnapshotProducts,
};
