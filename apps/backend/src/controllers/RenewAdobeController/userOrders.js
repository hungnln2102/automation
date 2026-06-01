const { db } = require("../../db");
const logger = require("../../utils/logger");
const { normalizeOtpSource } = require("../../services/otpProviderService");
const {
  assignUserToAvailableAccount,
} = require("../../services/renew-adobe/fixUserAssignmentService");
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
const { resolveDongvanOAuthFromBody } = require("../../services/dongvan/parseDongvanLine");

const listUserOrders = async (_req, res) => {
  try {
    const rows = await db({ t: TRACK_TABLE })
      .leftJoin({ acc: ACC_TABLE }, function joinAccountByOrgName() {
        this.on(
          db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`acc.${ACC_COLS.ORG_NAME}`]),
          "=",
          db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`t.${TRACK_COLS.ORG_NAME}`])
        )
          .andOn(
            db.raw(`TRIM(COALESCE(??, '')) <> ''`, [`acc.${ACC_COLS.ORG_NAME}`])
          )
          .andOn(
            db.raw(`TRIM(COALESCE(??, '')) <> ''`, [`t.${TRACK_COLS.ORG_NAME}`])
          );
      })
      .select(
        `t.${TRACK_COLS.ID} as list_user_id`,
        `t.${TRACK_COLS.ACCOUNT} as information_order`,
        `t.${TRACK_COLS.CUSTOMER} as customer`,
        `t.${TRACK_COLS.ACCOUNT} as contact`,
        db.raw(
          `TO_CHAR((t.${TRACK_COLS.EXPIRED})::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as expiry_date`
        ),
        `t.${TRACK_COLS.STATUS} as status`,
        `t.${TRACK_COLS.ID_PRODUCT} as id_product`,
        `t.${TRACK_COLS.OTP_SOURCE} as otp_source`,
        `t.${TRACK_COLS.ORG_NAME} as tracking_org_name`,
        `t.${TRACK_COLS.STATUS} as tracking_status`,
        `acc.${ACC_COLS.ID} as adobe_account_id`,
        `acc.${ACC_COLS.ID_PRODUCT} as admin_id_product`,
        `acc.${ACC_COLS.LICENSE_STATUS} as admin_license_status`,
        `acc.${ACC_COLS.ORG_NAME} as admin_org_name`
      )
      .orderBy(`t.${TRACK_COLS.ID}`, "asc");

    logger.info(
      "[renew-adobe] user-orders: %d rows from system_automation.list_user",
      rows.length
    );
    return res.json(rows);
  } catch (error) {
    logger.error("[renew-adobe] user-orders failed", { error: error.message });
    return res
      .status(500)
      .json({ error: "Khong the tai danh sach user-orders." });
  }
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Khớp constraint `order_user_tracking_status_check` khi bảng list_user dùng chung CHECK với order_user_tracking. */
const LIST_USER_ALLOWED_STATUS = new Set([
  "có gói",
  "chưa cấp quyền",
  "chưa add",
]);

function resolveListUserStatus(raw) {
  const s =
    raw == null || String(raw).trim() === ""
      ? "chưa add"
      : String(raw).trim();
  if (s === "chua add") return "chưa add";
  if (LIST_USER_ALLOWED_STATUS.has(s)) return s;
  return null;
}

function normalizeListUserOtpSource(raw) {
  const requestedOtpSource = normalizeOtpSource(raw, { hasMailBackupId: false });
  return requestedOtpSource === "imap" ? "hdsd" : requestedOtpSource;
}

function resolveOtpOAuthFields(body) {
  return resolveDongvanOAuthFromBody(body);
}

function validateDongvanCredentials(otpSource, oauth) {
  if (otpSource !== "dongvan") return null;
  if (!oauth.refreshToken || !oauth.clientId) {
    return "DongVan OTP cần dán dòng mail đầy đủ (email|...|token|client_id).";
  }
  return null;
}

const createListUser = async (req, res) => {
  try {
    const body = req.body || {};
    const account = String(body.account ?? body.email ?? "")
      .trim()
      .toLowerCase();
    if (!account) {
      return res.status(400).json({ error: "Thiếu email người dùng (account)." });
    }
    if (!EMAIL_RE.test(account)) {
      return res.status(400).json({ error: "Email không hợp lệ." });
    }

    const customerRaw = body.customer;
    const customer =
      customerRaw != null && String(customerRaw).trim() !== ""
        ? String(customerRaw).trim()
        : null;

    const orgRaw = body.org_name;
    const org_name =
      orgRaw != null && String(orgRaw).trim() !== ""
        ? String(orgRaw).trim()
        : null;

    let expired = null;
    if (body.expired != null && String(body.expired).trim() !== "") {
      const d = String(body.expired).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return res
          .status(400)
          .json({ error: "Hạn dùng phải là ngày dạng YYYY-MM-DD." });
      }
      expired = d;
    }

    const status = resolveListUserStatus(body.status);
    if (!status) {
      return res.status(400).json({
        error:
          "status không hợp lệ. Cho phép: có gói, chưa cấp quyền, chưa add.",
      });
    }

    const idProductBody = body.id_product;
    const id_product =
      idProductBody != null && String(idProductBody).trim() !== ""
        ? String(idProductBody).trim()
        : null;

    const otp_source = normalizeListUserOtpSource(body.otp_source ?? "hdsd");
    const oauth = resolveOtpOAuthFields(body);
    const dongvanErr = validateDongvanCredentials(otp_source, oauth);
    if (dongvanErr) {
      return res.status(400).json({ error: dongvanErr });
    }

    const insertRow = {
      [TRACK_COLS.CUSTOMER]: customer,
      [TRACK_COLS.ACCOUNT]: account,
      [TRACK_COLS.ORG_NAME]: org_name,
      [TRACK_COLS.EXPIRED]: expired,
      [TRACK_COLS.STATUS]: status,
      [TRACK_COLS.ID_PRODUCT]: id_product,
      ...(TRACK_COLS.OTP_SOURCE ? { [TRACK_COLS.OTP_SOURCE]: otp_source } : {}),
      ...(TRACK_COLS.OTP_REFRESH_TOKEN
        ? { [TRACK_COLS.OTP_REFRESH_TOKEN]: oauth.refreshToken }
        : {}),
      ...(TRACK_COLS.OTP_CLIENT_ID ? { [TRACK_COLS.OTP_CLIENT_ID]: oauth.clientId } : {}),
      ...(TRACK_COLS.OTP_MAIL_EMAIL ? { [TRACK_COLS.OTP_MAIL_EMAIL]: oauth.mailEmail } : {}),
    };

    const existing = await db(TRACK_TABLE)
      .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [TRACK_COLS.ACCOUNT, account])
      .orderBy(TRACK_COLS.ID, "asc")
      .first();

    let inserted = null;
    let updatedExisting = false;

    if (existing?.[TRACK_COLS.ID]) {
      [inserted] = await db(TRACK_TABLE)
        .where(TRACK_COLS.ID, existing[TRACK_COLS.ID])
        .update({
          ...insertRow,
          ...(TRACK_COLS.UPDATED_AT ? { [TRACK_COLS.UPDATED_AT]: db.fn.now() } : {}),
        })
        .returning("*");
      updatedExisting = true;
      logger.info(
        "[renew-adobe] list_user: updated id=%s account=%s (trùng email)",
        inserted?.id,
        account
      );
    } else {
      [inserted] = await db(TRACK_TABLE).insert(insertRow).returning("*");
      logger.info("[renew-adobe] list_user: inserted id=%s account=%s", inserted?.id, account);
    }

    const assignAdobeNow =
      body.assignAdobeNow === true ||
      String(body.assign_adobe_now || "")
        .trim()
        .toLowerCase() === "true";

    let assignAdobe = false;
    let assignPayload = {};

    if (assignAdobeNow) {
      assignAdobe = true;
      try {
        const assigned = await assignUserToAvailableAccount(account, {
          skipLogin: true,
        });
        assignPayload =
          assigned.alreadyLinked === true
            ? {
                assign_already_linked: true,
                assign_profile: assigned.profileName ?? null,
              }
            : {
                assign_account_id: assigned.accountId,
                assign_account_email: assigned.accountEmail,
                assign_profile: assigned.profileName ?? null,
              };
      } catch (assignErr) {
        const msg = assignErr?.message || String(assignErr);
        logger.warn("[renew-adobe] list_user: gán Adobe sau insert thất bại", {
          account,
          error: msg,
        });
        assignPayload = { assign_error: msg };
      }
    }

    return res.status(updatedExisting ? 200 : 201).json({
      ok: true,
      id: inserted?.id,
      updated: updatedExisting,
      message: updatedExisting
        ? "Email đã có trong danh sách — đã cập nhật thông tin (không tạo bản ghi mới)."
        : undefined,
      assignAdobe,
      ...assignPayload,
    });
  } catch (error) {
    logger.error("[renew-adobe] list_user create failed", { error: error.message });
    return res.status(500).json({ error: "Khong the luu list_user." });
  }
};

const deleteListUser = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID không hợp lệ." });
  }

  try {
    const removed = await db(TRACK_TABLE).where(TRACK_COLS.ID, id).del();
    if (!removed) {
      return res.status(404).json({ error: "Không tìm thấy user trong list_user." });
    }
    logger.info("[renew-adobe] list_user: deleted id=%s", id);
    return res.json({ ok: true, id });
  } catch (error) {
    logger.error("[renew-adobe] list_user delete failed", { id, error: error.message });
    return res.status(500).json({ error: "Không xóa được user." });
  }
};

module.exports = {
  listUserOrders,
  createListUser,
  deleteListUser,
};
