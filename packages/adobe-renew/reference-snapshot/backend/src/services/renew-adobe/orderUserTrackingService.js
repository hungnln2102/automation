/**
 * Đồng bộ `system_automation.order_user_tracking` cho đơn Renew Adobe.
 * - Mỗi order_id một dòng (UNIQUE trên DB).
 * - Ưu tiên cập nhật theo sự kiện (check account / gán user), tránh quét full bảng theo chu kỳ.
 */

const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const {
  TBL_ORDER,
  ORD_COLS,
  getRenewAdobeVariantIds,
} = require("../../controllers/RenewAdobeController/orderAccess");

const TRACK_TABLE = "system_automation.order_user_tracking";

const MAP_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const MAP_COLS = RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.COLS;

const ACC_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE,
  SCHEMA_RENEW_ADOBE
);
const ACC_COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** Khớp key với cách lưu org_name trên order_user_tracking (trim + lower). */
function normalizeOrgKeyForTracking(orgName) {
  const s = String(orgName ?? "").trim().toLowerCase();
  return s || "";
}

/**
 * Số dòng `order_user_tracking` gắn với từng tài khoản admin: đếm theo
 * `user_account_mapping` → join `order_user_tracking` trên mã đơn (id_order = order_id),
 * không còn cộng dồn theo tên org (nhiều tài khoản / dòng cũ cùng org sẽ không làm lệch x).
 * @param {object[]} accountRows - rows có ít nhất id
 * @param {string} [idCol='id']
 * @param {string} [_orgCol='org_name'] - giữ tương thích chữ ký; không còn dùng
 * @returns {Promise<Map<number, number>>}
 */
async function getOrderUserTrackingCountsForAdminAccounts(
  accountRows,
  idCol = "id",
  _orgCol = "org_name"
) {
  const result = new Map();
  if (!accountRows || accountRows.length === 0) return result;

  for (const r of accountRows) {
    const id = Number(r[idCol]);
    if (Number.isFinite(id) && id > 0) result.set(id, 0);
  }

  const accountIds = [...result.keys()];
  if (accountIds.length === 0) return result;

  const mTable = MAP_TABLE;
  const tTable = TRACK_TABLE;
  const colAid = MAP_COLS.ADOBE_ACCOUNT_ID;
  const colOid = MAP_COLS.ORDER_ID;

  const { rows: joined } = await db.raw(
    `
    SELECT
      m.${colAid} AS adobe_id,
      COUNT(DISTINCT t.order_id)::int AS c
    FROM ${mTable} m
    INNER JOIN ${tTable} t
      ON lower(btrim(m.${colOid}::text)) = lower(btrim(t.order_id::text))
    WHERE m.${colAid} IN (${accountIds.map(() => "?").join(",")})
    GROUP BY m.${colAid}
    `,
    accountIds
  );

  for (const ro of joined) {
    const aid = Number(ro.adobe_id);
    if (Number.isFinite(aid) && result.has(aid)) {
      result.set(aid, Number(ro.c) || 0);
    }
  }

  return result;
}

/** product cột DB: boolean / 'true'|'false' / chuỗi — chỉ CCP / Creative Cloud Pro mới là có gói (khớp accessChecks). */
function mappingImpliesHasPackage(productRaw) {
  if (productRaw === false || productRaw === 0) return false;
  if (productRaw === true || productRaw === 1) return true;
  if (typeof productRaw === "string") {
    const n = productRaw.trim().toLowerCase();
    if (!n) return false;
    if (["false", "0", "no"].includes(n)) return false;
    if (["true", "1", "yes"].includes(n)) return true;
    if (n.includes("miễn phí") || n.includes("mien phi")) return false;
    if (n.includes("gói thành viên") || n.includes("goi thanh vien")) return false;
    if (n.includes("thành viên miễn phí") || n.includes("thanh vien mien phi")) return false;
    if (n.includes("free membership")) return false;
    if (n.includes("free") && n.includes("member")) return false;
    return (
      n.includes("ccp") ||
      n.includes("creative cloud pro") ||
      n.includes("creativecloudpro")
    );
  }
  return Boolean(productRaw);
}

function resolveRowStatus({ informationOrder, mapping }) {
  const email = normalizeEmail(informationOrder);
  if (!email) return "chưa add";
  if (!mapping) return "chưa add";
  const adobeId = mapping[MAP_COLS.ADOBE_ACCOUNT_ID];
  if (adobeId == null || adobeId === "") return "chưa add";
  if (!mappingImpliesHasPackage(mapping[MAP_COLS.PRODUCT])) {
    return "chưa cấp quyền";
  }
  return "có gói";
}

/**
 * Upsert các đơn đã lấy từ order_list (đã lọc renew_adobe nếu cần ở caller).
 * @param {object[]} orders - rows có ORD_COLS + expired_vn
 * @returns {Promise<number>} số đơn đã upsert
 */
async function upsertTrackingRowsFromOrderRows(orders) {
  if (!orders || orders.length === 0) return 0;

  const orderCodes = orders
    .map((o) => String(o[ORD_COLS.ID_ORDER] || "").trim())
    .filter(Boolean);

  const mappings =
    orderCodes.length > 0
      ? await db(MAP_TABLE)
          .select(
            MAP_COLS.USER_EMAIL,
            MAP_COLS.ORDER_ID,
            MAP_COLS.ADOBE_ACCOUNT_ID,
            MAP_COLS.PRODUCT
          )
          .whereIn(MAP_COLS.ORDER_ID, orderCodes)
      : [];

  const mapByOrderAndEmail = new Map();
  for (const m of mappings) {
    const oc = String(m[MAP_COLS.ORDER_ID] || "").trim();
    const em = normalizeEmail(m[MAP_COLS.USER_EMAIL]);
    if (!oc || !em) continue;
    mapByOrderAndEmail.set(`${oc}::${em}`, m);
  }

  const accountIds = [
    ...new Set(
      mappings
        .map((m) => m[MAP_COLS.ADOBE_ACCOUNT_ID])
        .filter((id) => id != null && Number.isFinite(Number(id)))
        .map((id) => Number(id))
    ),
  ];

  const accountMetaById = new Map();
  if (accountIds.length > 0) {
    const accSelect = [
      ACC_COLS.ID,
      ACC_COLS.ORG_NAME,
      ...(ACC_COLS.ID_PRODUCT ? [ACC_COLS.ID_PRODUCT] : []),
    ];
    const accRows = await db(ACC_TABLE).select(...accSelect).whereIn(ACC_COLS.ID, accountIds);
    for (const a of accRows) {
      const pid =
        ACC_COLS.ID_PRODUCT && a[ACC_COLS.ID_PRODUCT] != null
          ? String(a[ACC_COLS.ID_PRODUCT]).trim()
          : "";
      accountMetaById.set(Number(a[ACC_COLS.ID]), {
        orgName: a[ACC_COLS.ORG_NAME] ?? null,
        idProduct: pid !== "" ? pid : null,
      });
    }
  }

  let upserted = 0;
  const trx = await db.transaction();
  try {
    for (const o of orders) {
      const orderId = String(o[ORD_COLS.ID_ORDER] || "").trim();
      if (!orderId) continue;

      const info = o[ORD_COLS.INFORMATION_ORDER];
      const emailKey = normalizeEmail(info);
      const mapping = emailKey
        ? mapByOrderAndEmail.get(`${orderId}::${emailKey}`)
        : null;

      const status = resolveRowStatus({
        informationOrder: info,
        mapping,
      });

      const adobeId = mapping?.[MAP_COLS.ADOBE_ACCOUNT_ID];
      const meta =
        adobeId != null && Number.isFinite(Number(adobeId))
          ? accountMetaById.get(Number(adobeId))
          : null;
      const orgName = meta?.orgName ?? null;
      const idProductStr = meta?.idProduct ?? null;

      const expired = o.expired_vn ?? null;
      const customer = o[ORD_COLS.CUSTOMER] ?? null;
      const account = emailKey || null;

      const insertRow = {
        order_id: orderId,
        customer,
        account,
        org_name: orgName,
        expired,
        status,
        update_at: trx.fn.now(),
      };
      const mergeRow = {
        customer,
        account,
        org_name: orgName,
        expired,
        status,
        update_at: trx.fn.now(),
      };
      if (idProductStr) {
        insertRow.id_product = idProductStr;
        mergeRow.id_product = idProductStr;
      }

      await trx(TRACK_TABLE).insert(insertRow).onConflict("order_id").merge(mergeRow);

      upserted += 1;
    }
    await trx.commit();
  } catch (e) {
    await trx.rollback();
    throw e;
  }

  return upserted;
}

/**
 * Sau khi check tài khoản: so sánh `manageTeamMembers` (Adobe) với mapping của admin,
 * cập nhật lại từng dòng `order_user_tracking` (status + org + id_product).
 * - Có trên team + có product → "có gói"
 * - Có trên team + chưa product → "chưa cấp quyền"
 * - Mapping còn gắn admin nhưng email không còn trên team → "chưa add"
 * @param {number} adobeAccountId
 * @param {Array<{ email?: string, product?: boolean, hasPackage?: boolean }>} manageTeamMembers
 * @returns {Promise<{ updated: number, onTeam: string[], notOnTeam: string[] }>}
 */
async function reconcileOrderUserTrackingWithTeamMembers(
  adobeAccountId,
  manageTeamMembers
) {
  const id = Number(adobeAccountId);
  if (!Number.isFinite(id) || id <= 0) {
    return { updated: 0, onTeam: [], notOnTeam: [] };
  }

  const teamByEmail = new Map();
  for (const m of Array.isArray(manageTeamMembers) ? manageTeamMembers : []) {
    const e = normalizeEmail(m?.email);
    if (!e) continue;
    const hasP = m?.product === true || m?.hasPackage === true;
    teamByEmail.set(e, { hasProduct: hasP });
  }

  const mappingRows = await db(MAP_TABLE)
    .where(MAP_COLS.ADOBE_ACCOUNT_ID, id)
    .select(MAP_COLS.ORDER_ID, MAP_COLS.USER_EMAIL);

  if (mappingRows.length === 0) {
    return { updated: 0, onTeam: [], notOnTeam: [] };
  }

  const acc = await db(ACC_TABLE)
    .select(ACC_COLS.ORG_NAME, ACC_COLS.ID_PRODUCT)
    .where(ACC_COLS.ID, id)
    .first();

  const orgName = acc?.[ACC_COLS.ORG_NAME] ?? null;
  const idProductStr =
    ACC_COLS.ID_PRODUCT && acc?.[ACC_COLS.ID_PRODUCT] != null
      ? String(acc[ACC_COLS.ID_PRODUCT]).trim()
      : null;

  const onTeamSet = new Set();
  const notOnTeamSet = new Set();
  for (const row of mappingRows) {
    const em = normalizeEmail(row[MAP_COLS.USER_EMAIL]);
    if (!em) continue;
    if (teamByEmail.has(em)) onTeamSet.add(em);
    else notOnTeamSet.add(em);
  }

  const orderIds = [
    ...new Set(
      mappingRows
        .map((r) => String(r[MAP_COLS.ORDER_ID] || "").trim())
        .filter(Boolean)
    ),
  ];
  if (orderIds.length === 0) {
    return { updated: 0, onTeam: [], notOnTeam: [] };
  }

  const existing = await db(TRACK_TABLE)
    .select("order_id")
    .whereIn(
      "order_id",
      orderIds.map((x) => String(x))
    );
  const existingSet = new Set(
    (existing || []).map((r) => String(r.order_id || "").trim())
  );
  const missing = orderIds.filter((oid) => !existingSet.has(oid));
  if (missing.length > 0) {
    await upsertRenewAdobeOrderUserTrackingForOrderIds(missing);
  }

  let updated = 0;
  const trx = await db.transaction();
  try {
    for (const row of mappingRows) {
      const orderId = String(row[MAP_COLS.ORDER_ID] || "").trim();
      const em = normalizeEmail(row[MAP_COLS.USER_EMAIL]);
      if (!orderId || !em) continue;

      const member = teamByEmail.get(em);
      const status = !member
        ? "chưa add"
        : member.hasProduct
          ? "có gói"
          : "chưa cấp quyền";

      // "chưa add" = chưa có trên team Adobe: không lưu tên org sản phẩm ở tracking
      // (tránh UI hiển thị profile trong khi cột tình trạng là Chưa add).
      const patch = {
        status,
        org_name: status === "chưa add" ? null : orgName,
        update_at: trx.fn.now(),
      };
      if (status === "chưa add") {
        patch.id_product = null;
      } else if (idProductStr) {
        patch.id_product = idProductStr;
      }
      const n = await trx(TRACK_TABLE)
        .where("order_id", orderId)
        .update(patch);
      updated += n;
    }
    await trx.commit();
  } catch (e) {
    await trx.rollback();
    throw e;
  }

  logger.info(
    "[order-user-tracking] Reconcile theo team Adobe: adobeAccountId=%s updated=%d onTeam=%d notOnTeam=%d",
    id,
    updated,
    onTeamSet.size,
    notOnTeamSet.size
  );

  return {
    updated,
    onTeam: [...onTeamSet],
    notOnTeam: [...notOnTeamSet],
  };
}

async function upsertRenewAdobeOrderUserTrackingForOrderIds(orderIds) {
  const variantIds = await getRenewAdobeVariantIds();
  if (!variantIds.length) return 0;

  const ids = [
    ...new Set(
      (Array.isArray(orderIds) ? orderIds : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (ids.length === 0) return 0;

  const orders = await db(TBL_ORDER)
    .select(
      ORD_COLS.ID_ORDER,
      ORD_COLS.CUSTOMER,
      ORD_COLS.INFORMATION_ORDER,
      db.raw(
        `((${TBL_ORDER}.${ORD_COLS.EXPIRY_DATE})::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date as expired_vn`
      )
    )
    .whereIn(ORD_COLS.ID_ORDER, ids)
    .whereIn(ORD_COLS.ID_PRODUCT, variantIds)
    .orderBy(ORD_COLS.ID_ORDER, "asc");

  const n = await upsertTrackingRowsFromOrderRows(orders);
  if (n > 0) {
    logger.info("[order-user-tracking] Đã upsert %d đơn (theo danh sách order_id).", n);
  }
  return n;
}

/**
 * Cập nhật tracking cho mọi đơn đang map vào một tài khoản Adobe admin (sau check / add user).
 * @param {number} adobeAccountId
 * @returns {Promise<number>}
 */
async function upsertRenewAdobeOrderUserTrackingForAccount(adobeAccountId) {
  const id = Number(adobeAccountId);
  if (!Number.isFinite(id) || id <= 0) return 0;

  const orderIds = await db(MAP_TABLE)
    .where(MAP_COLS.ADOBE_ACCOUNT_ID, id)
    .distinct(MAP_COLS.ORDER_ID)
    .pluck(MAP_COLS.ORDER_ID);

  const cleaned = orderIds
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  if (cleaned.length === 0) return 0;

  return upsertRenewAdobeOrderUserTrackingForOrderIds(cleaned);
}

/**
 * Quét toàn bộ đơn renew_adobe — chỉ dùng backfill / chạy tay, không nên gắn cron dày đặc.
 * @returns {Promise<{ upserted: number }>}
 */
async function syncAllRenewAdobeOrderUserTracking() {
  const variantIds = await getRenewAdobeVariantIds();
  if (!variantIds.length) {
    logger.info("[order-user-tracking] Không có variant renew_adobe — bỏ qua.");
    return { upserted: 0 };
  }

  const orders = await db(TBL_ORDER)
    .select(
      ORD_COLS.ID_ORDER,
      ORD_COLS.CUSTOMER,
      ORD_COLS.INFORMATION_ORDER,
      db.raw(
        `((${TBL_ORDER}.${ORD_COLS.EXPIRY_DATE})::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date as expired_vn`
      )
    )
    .whereIn(ORD_COLS.ID_PRODUCT, variantIds)
    .orderBy(ORD_COLS.ID_ORDER, "asc");

  const upserted = await upsertTrackingRowsFromOrderRows(orders);
  logger.info(
    "[order-user-tracking] Full sync: đã upsert %d đơn (variant renew_adobe: %d).",
    upserted,
    variantIds.length
  );
  return { upserted };
}

/**
 * Số dòng order_user_tracking theo org (khớp lower(trim(org_name))).
 * Dùng để tránh tự xóa bản ghi tài khoản admin khi chưa có bản ghi tracking cho org nào.
 */
async function getOrderUserTrackingCountByOrgName(orgName) {
  const k = normalizeOrgKeyForTracking(orgName);
  if (!k) {
    return 0;
  }
  const row = await db(TRACK_TABLE)
    .whereRaw(`lower(btrim(COALESCE(org_name::text, ''))) = ?`, [k])
    .count("* as c")
    .first();
  return Number(row?.c) || 0;
}

/**
 * @deprecated Dùng {@link getMapAccountIdToUserEmailsFor2330Cleanup} — bản cũ chỉ expired = **đúng hôm nay**, không còn dùng trong cron.
 */
async function getMapAccountIdToUserEmailsForTrackingExpiredToday() {
  const rows = await db(TRACK_TABLE)
    .select("account")
    .whereNotNull("account")
    .whereNotNull("expired")
    .whereRaw(
      "expired = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
    );

  const emails = [
    ...new Set(
      rows
        .map((r) => normalizeEmail(r.account))
        .filter(Boolean)
    ),
  ];
  if (emails.length === 0) {
    return new Map();
  }

  const mapEmailCol = `${MAP_TABLE}.${MAP_COLS.USER_EMAIL}`;
  const mappings = await db(MAP_TABLE)
    .select(MAP_COLS.USER_EMAIL, MAP_COLS.ADOBE_ACCOUNT_ID)
    .whereNotNull(MAP_COLS.ADOBE_ACCOUNT_ID)
    .whereRaw(`lower(btrim(${mapEmailCol}::text)) = ANY(?::text[])`, [emails]);

  const out = new Map();
  for (const m of mappings) {
    const id = Number(m[MAP_COLS.ADOBE_ACCOUNT_ID]);
    const em = normalizeEmail(m[MAP_COLS.USER_EMAIL]);
    if (!Number.isFinite(id) || id <= 0 || !em) {
      continue;
    }
    if (!out.has(id)) {
      out.set(id, new Set());
    }
    out.get(id).add(em);
  }
  return out;
}

/**
 * Luồng 23:30 (B1): Quét đơn **hết hạn** (theo bảng tracking + bổ sung order_list nếu thiếu dòng tracking),
 * chỉ tính cặp (order, email) **khớp** `user_account_mapping` gắn `adobe_account_id`.
 * Không còn rule "không nằm trong activeEmails → xóa" (dễ xóa nhầm).
 *
 * @returns {Promise<Map<number, Set<string>>>} adobe_account_id → email (chữ thường, trim)
 */
async function getMapAccountIdToUserEmailsFor2330Cleanup() {
  const variantIds = await getRenewAdobeVariantIds();
  if (variantIds.length === 0) {
    return new Map();
  }

  const out = new Map();
  const add = (adobeId, em) => {
    const id = Number(adobeId);
    const e = normalizeEmail(em);
    if (!Number.isFinite(id) || id <= 0 || !e) return;
    if (!out.has(id)) {
      out.set(id, new Set());
    }
    out.get(id).add(e);
  };

  // B1a: order_user_tracking — hết hạn tính tới hôm nay (VN), join mapping cùng order_id + email
  const tRows = await db({ t: TRACK_TABLE })
    .join({ m: MAP_TABLE }, function joinTrMap() {
      this.on(
        db.raw("CAST(?? AS TEXT)", [`m.${MAP_COLS.ORDER_ID}`]),
        "=",
        "t.order_id"
      ).andOn(
        db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`m.${MAP_COLS.USER_EMAIL}`]),
        "=",
        db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`t.account`])
      );
    })
    .whereNotNull(`m.${MAP_COLS.ADOBE_ACCOUNT_ID}`)
    .whereNotNull("t.expired")
    .whereNotNull("t.account")
    .whereRaw(
      `t.expired::date <= (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`
    )
    .select(
      `m.${MAP_COLS.ADOBE_ACCOUNT_ID} as adobe_id`,
      db.raw(`LOWER(TRIM(COALESCE(??, ''))) as em`, [`m.${MAP_COLS.USER_EMAIL}`])
    );

  for (const r of tRows) {
    add(r.adobe_id, r.em);
  }

  // B1b: order_list cùng variant renew + đã hết hạn — bắt trường hợp thiếu/ lệch dòng tracking
  const oRows = await db({ o: TBL_ORDER })
    .join({ m: MAP_TABLE }, function joinOrdMap() {
      this.on(`o.${ORD_COLS.ID_ORDER}`, `m.${MAP_COLS.ORDER_ID}`).andOn(
        db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`o.${ORD_COLS.INFORMATION_ORDER}`]),
        "=",
        db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`m.${MAP_COLS.USER_EMAIL}`])
      );
    })
    .whereIn(`o.${ORD_COLS.ID_PRODUCT}`, variantIds)
    .whereNotNull(`m.${MAP_COLS.ADOBE_ACCOUNT_ID}`)
    .whereNotNull(`o.${ORD_COLS.INFORMATION_ORDER}`)
    .whereNotNull(`o.${ORD_COLS.EXPIRY_DATE}`)
    .whereRaw(
      `(o.${ORD_COLS.EXPIRY_DATE})::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh' <= (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`
    )
    .select(
      `m.${MAP_COLS.ADOBE_ACCOUNT_ID} as adobe_id`,
      db.raw(`LOWER(TRIM(COALESCE(??, ''))) as em`, [`m.${MAP_COLS.USER_EMAIL}`])
    );

  for (const r of oRows) {
    add(r.adobe_id, r.em);
  }

  return out;
}

module.exports = {
  upsertRenewAdobeOrderUserTrackingForOrderIds,
  upsertRenewAdobeOrderUserTrackingForAccount,
  reconcileOrderUserTrackingWithTeamMembers,
  syncAllRenewAdobeOrderUserTracking,
  getOrderUserTrackingCountsForAdminAccounts,
  normalizeOrgKeyForTracking,
  getOrderUserTrackingCountByOrgName,
  getMapAccountIdToUserEmailsForTrackingExpiredToday,
  getMapAccountIdToUserEmailsFor2330Cleanup,
};
