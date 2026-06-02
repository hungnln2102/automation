const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");

const TRACK_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const TRACK_COLS = RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.COLS;
const ACC_TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
const ACC_COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeOrgKeyForTracking(orgName) {
  const s = String(orgName ?? "").trim().toLowerCase();
  return s || "";
}

/** @returns {Set<string>} uppercase Adobe product id tokens */
function normalizeAdminProductIdSet(raw) {
  const set = new Set();
  if (raw == null) return set;
  const s = String(raw).trim();
  if (!s) return set;
  for (const part of s.split(/[\s,;]+/)) {
    const id = part.trim();
    if (id) set.add(id.toUpperCase());
  }
  return set;
}

function memberProductIds(member) {
  const products = Array.isArray(member?.products) ? member.products : [];
  const ids = [];
  for (const p of products) {
    if (p == null) continue;
    if (typeof p === "string") {
      const s = p.trim();
      if (s) ids.push(s);
      continue;
    }
    const id = String(p?.id ?? p?.productId ?? "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Trạng thái tracking theo team + gói admin (id_product trên accounts_admin hoặc scrape).
 * @param {object|null} member manageTeamMembers entry
 * @param {Set<string>} adminProductIdSet
 * @param {boolean} onTeam
 */
function resolveTrackingIdProductAndStatus(member, adminProductIdSet, onTeam) {
  if (!onTeam) {
    return { idProduct: null, status: "chưa add" };
  }
  const ids = member ? memberProductIds(member) : [];
  if (ids.length === 0) {
    return { idProduct: null, status: "chưa cấp quyền" };
  }
  const primary = ids[0];
  for (const id of ids) {
    if (adminProductIdSet.has(String(id).toUpperCase())) {
      return { idProduct: id, status: "có gói" };
    }
  }
  return { idProduct: primary, status: "chưa cấp quyền" };
}

async function resolveAdminProductIdSet(adobeAccountId, scrapedAdminIdProduct) {
  const fromScrape = normalizeAdminProductIdSet(scrapedAdminIdProduct);
  if (fromScrape.size > 0) return fromScrape;
  const row = await db(ACC_TABLE).where(ACC_COLS.ID, adobeAccountId).first();
  return normalizeAdminProductIdSet(row?.[ACC_COLS.ID_PRODUCT]);
}

async function getOrderUserTrackingCountsForAdminAccounts(
  accountRows,
  idCol = "id",
  orgCol = "org_name"
) {
  const result = new Map();
  if (!accountRows || accountRows.length === 0) return result;

  const orgKeys = [];
  for (const row of accountRows) {
    const id = Number(row[idCol]);
    if (Number.isFinite(id) && id > 0) result.set(id, 0);
    const orgKey = normalizeOrgKeyForTracking(row[orgCol]);
    if (orgKey) orgKeys.push(orgKey);
  }
  const uniqueOrgKeys = [...new Set(orgKeys)];
  if (uniqueOrgKeys.length === 0) return result;

  const { rows } = await db.raw(
    `
    SELECT
      lower(btrim(COALESCE(${TRACK_COLS.ORG_NAME}::text, ''))) AS org_key,
      COUNT(*)::int AS c
    FROM ${TRACK_TABLE}
    WHERE lower(btrim(COALESCE(${TRACK_COLS.ORG_NAME}::text, ''))) IN (${uniqueOrgKeys.map(() => "?").join(",")})
    GROUP BY lower(btrim(COALESCE(${TRACK_COLS.ORG_NAME}::text, '')))
    `,
    uniqueOrgKeys
  );

  const countByOrg = new Map(
    rows.map((row) => [String(row.org_key || ""), Number(row.c) || 0])
  );
  for (const row of accountRows) {
    const id = Number(row[idCol]);
    const orgKey = normalizeOrgKeyForTracking(row[orgCol]);
    if (Number.isFinite(id) && result.has(id) && orgKey) {
      result.set(id, countByOrg.get(orgKey) || 0);
    }
  }

  return result;
}

async function upsertRenewAdobeOrderUserTrackingForOrderIds() {
  return 0;
}

async function upsertRenewAdobeOrderUserTrackingForAccount() {
  return 0;
}

/**
 * Sau Adobe Check: thêm user trên team Adobe vào list_user nếu email chưa có.
 * Email đã tồn tại → bỏ qua (không insert trùng, không cập nhật).
 */
async function ensureTeamMembersInListUser(
  adobeAccountId,
  manageTeamMembers,
  adminIdProductFromScrape = null,
  { adminOrgNameFromScrape = null } = {}
) {
  const accountRow = await db(ACC_TABLE).where(ACC_COLS.ID, adobeAccountId).first();
  const adminOrgName =
    String(accountRow?.[ACC_COLS.ORG_NAME] ?? adminOrgNameFromScrape ?? "").trim() || null;
  if (!adminOrgName) {
    return { inserted: 0, skipped: 0, skippedReason: "missing_admin_org" };
  }

  const members = Array.isArray(manageTeamMembers) ? manageTeamMembers : [];
  if (members.length === 0) {
    return { inserted: 0, skipped: 0, adobeAccountId };
  }

  const adminProductSet = await resolveAdminProductIdSet(
    adobeAccountId,
    adminIdProductFromScrape
  );

  let inserted = 0;
  let skipped = 0;

  for (const member of members) {
    const email = normalizeEmail(member?.email);
    if (!email) continue;

    const existing = await db(TRACK_TABLE)
      .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [TRACK_COLS.ACCOUNT, email])
      .first();
    if (existing) {
      skipped += 1;
      continue;
    }

    const { idProduct, status } = resolveTrackingIdProductAndStatus(
      member,
      adminProductSet,
      true
    );

    const insertRow = {
      [TRACK_COLS.CUSTOMER]:
        member?.name != null && String(member.name).trim() !== ""
          ? String(member.name).trim()
          : null,
      [TRACK_COLS.ACCOUNT]: email,
      [TRACK_COLS.ORG_NAME]: adminOrgName,
      [TRACK_COLS.EXPIRED]: null,
      [TRACK_COLS.STATUS]: status,
      [TRACK_COLS.ID_PRODUCT]: idProduct,
      ...(TRACK_COLS.OTP_SOURCE ? { [TRACK_COLS.OTP_SOURCE]: "hdsd" } : {}),
    };

    await db(TRACK_TABLE).insert(insertRow);
    inserted += 1;
  }

  if (inserted > 0) {
    logger.info(
      "[renew-adobe] list_user: thêm %d user từ Adobe check (admin id=%s, bỏ qua %d đã có)",
      inserted,
      adobeAccountId,
      skipped
    );
  }

  return { inserted, skipped, adobeAccountId };
}

/**
 * Đồng bộ list_user với danh sách team Adobe sau check.
 * Chỉ cập nhật các dòng cùng org với tài khoản admin đang check (tránh org khác bị ghi sai).
 */
async function reconcileOrderUserTrackingWithTeamMembers(
  adobeAccountId,
  manageTeamMembers,
  adminIdProductFromScrape = null
) {
  const accountRow = await db(ACC_TABLE).where(ACC_COLS.ID, adobeAccountId).first();
  const adminOrgKey = normalizeOrgKeyForTracking(accountRow?.[ACC_COLS.ORG_NAME]);
  if (!adminOrgKey) {
    return { updated: 0, onTeam: [], notOnTeam: [], skipped: "missing_admin_org" };
  }

  const teamEmails = new Set(
    (Array.isArray(manageTeamMembers) ? manageTeamMembers : [])
      .map((member) => normalizeEmail(member?.email))
      .filter(Boolean)
  );
  const membersByEmail = new Map();
  for (const m of Array.isArray(manageTeamMembers) ? manageTeamMembers : []) {
    const e = normalizeEmail(m?.email);
    if (e) membersByEmail.set(e, m);
  }

  const adminProductSet = await resolveAdminProductIdSet(
    adobeAccountId,
    adminIdProductFromScrape
  );

  const rows = await db(TRACK_TABLE)
    .select(TRACK_COLS.ID, TRACK_COLS.ACCOUNT)
    .whereNotNull(TRACK_COLS.ACCOUNT)
    .whereRaw(`lower(btrim(COALESCE(${TRACK_COLS.ORG_NAME}::text, ''))) = ?`, [
      adminOrgKey,
    ]);

  let updated = 0;
  const onTeam = [];
  const notOnTeam = [];
  for (const row of rows) {
    const email = normalizeEmail(row[TRACK_COLS.ACCOUNT]);
    if (!email) continue;
    const hasTeamMember = teamEmails.has(email);
    if (hasTeamMember) onTeam.push(email);
    else notOnTeam.push(email);

    const member = hasTeamMember ? membersByEmail.get(email) : null;
    const { idProduct, status } = resolveTrackingIdProductAndStatus(
      member,
      adminProductSet,
      hasTeamMember
    );

    updated += await db(TRACK_TABLE)
      .where(TRACK_COLS.ID, row[TRACK_COLS.ID])
      .update({
        [TRACK_COLS.STATUS]: status,
        [TRACK_COLS.ID_PRODUCT]: idProduct,
        [TRACK_COLS.UPDATED_AT]: db.fn.now(),
      });
  }

  return { updated, onTeam, notOnTeam, adobeAccountId };
}

async function syncAllRenewAdobeOrderUserTracking() {
  return { upserted: 0 };
}

async function getOrderUserTrackingCountByOrgName(orgName) {
  const key = normalizeOrgKeyForTracking(orgName);
  if (!key) return 0;
  const row = await db(TRACK_TABLE)
    .whereRaw(`lower(btrim(COALESCE(${TRACK_COLS.ORG_NAME}::text, ''))) = ?`, [key])
    .count("* as c")
    .first();
  return Number(row?.c) || 0;
}

async function getMapAccountIdToUserEmailsForTrackingExpiredToday() {
  return new Map();
}

async function getMapAccountIdToUserEmailsFor2330Cleanup() {
  return new Map();
}

module.exports = {
  upsertRenewAdobeOrderUserTrackingForOrderIds,
  upsertRenewAdobeOrderUserTrackingForAccount,
  ensureTeamMembersInListUser,
  reconcileOrderUserTrackingWithTeamMembers,
  syncAllRenewAdobeOrderUserTracking,
  getOrderUserTrackingCountsForAdminAccounts,
  normalizeOrgKeyForTracking,
  getOrderUserTrackingCountByOrgName,
  getMapAccountIdToUserEmailsForTrackingExpiredToday,
  getMapAccountIdToUserEmailsFor2330Cleanup,
  normalizeAdminProductIdSet,
  memberProductIds,
  resolveTrackingIdProductAndStatus,
};
