const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  TBL_ORDER,
  ORD_COLS,
  ALLOWED_ORDER_STATUSES,
  getRenewAdobeVariantIds,
} = require("./orderAccess");
const {
  normalizeEmail,
  findAccountMatchByEmail,
} = require("./accountLookup");
const { assignUserToAvailableAccount } = require("./assignmentService");
const { buildWebsiteStatusPayload } = require("./statusUtils");
const { runCheckForAccountId } = require("./checkAccounts");
const { runCheckAllAccountsFlow } = require("./autoAssign");

function compareOrders(a, b) {
  const expiryA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
  const expiryB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
  if (expiryA !== expiryB) {
    return expiryB - expiryA;
  }

  const orderDateA = a.order_date ? new Date(a.order_date).getTime() : 0;
  const orderDateB = b.order_date ? new Date(b.order_date).getTime() : 0;
  if (orderDateA !== orderDateB) {
    return orderDateB - orderDateA;
  }

  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

async function findLatestRenewOrderByEmail(email) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) {
    return null;
  }

  const variantIds = await getRenewAdobeVariantIds();
  if (variantIds.length === 0) {
    return null;
  }

  const rows = await db(TBL_ORDER)
    .select(
      `${TBL_ORDER}.${ORD_COLS.ID} as id`,
      `${TBL_ORDER}.${ORD_COLS.ID_ORDER} as order_code`,
      `${TBL_ORDER}.${ORD_COLS.STATUS} as status`,
      `${TBL_ORDER}.${ORD_COLS.ORDER_DATE} as order_date`,
      db.raw(
        `TO_CHAR((${TBL_ORDER}.${ORD_COLS.EXPIRY_DATE})::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as expiry_date`
      )
    )
    .whereIn(ORD_COLS.ID_PRODUCT, variantIds)
    .whereIn(ORD_COLS.STATUS, ALLOWED_ORDER_STATUSES)
    .whereNotNull(ORD_COLS.INFORMATION_ORDER)
    .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [
      ORD_COLS.INFORMATION_ORDER,
      emailLower,
    ]);

  if (rows.length === 0) {
    return null;
  }

  return [...rows].sort(compareOrders)[0];
}

async function getWebsiteStatusPayload(email, options = {}) {
  const normalized = normalizeEmail(email);
  const [order, initialAccountMatch] = await Promise.all([
    findLatestRenewOrderByEmail(normalized),
    findAccountMatchByEmail(normalized),
  ]);
  let accountMatch = initialAccountMatch;

  if (options.refreshMatchedAccount && accountMatch?.account?.id) {
    try {
      await runCheckForAccountId(accountMatch.account.id);
      accountMatch = await findAccountMatchByEmail(normalized);
    } catch (error) {
      logger.warn("[renew-adobe] website status refresh matched account failed", {
        email: normalized,
        accountId: accountMatch.account.id,
        error: error.message,
      });
    }
  }

  return buildWebsiteStatusPayload({
    email: normalized,
    order,
    account: accountMatch.account,
    matchedUser: accountMatch.matchedUser,
  });
}

const getWebsiteStatus = async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ success: false, error: "Thiếu tham số email." });
  }
  const refreshFlagRaw = String(req.query.refresh ?? "").trim().toLowerCase();
  const refreshMatchedAccount = ["1", "true", "yes", "y"].includes(refreshFlagRaw);

  try {
    const payload = await getWebsiteStatusPayload(email, {
      // Endpoint status cho web cần phản hồi nhanh, tránh timeout do Playwright.
      // Muốn check live có thể gọi với ?refresh=1.
      refreshMatchedAccount,
    });
    return res.json(payload);
  } catch (error) {
    logger.error("[renew-adobe] website status failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: "Không thể kiểm tra trạng thái Renew Adobe lúc này.",
    });
  }
};

const activateWebsiteUser = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ success: false, error: "Thiếu email." });
  }

  try {
    const currentStatus = await getWebsiteStatusPayload(email, {
      refreshMatchedAccount: true,
    });

    if (currentStatus.status === "active") {
      return res.json(currentStatus);
    }

    if (!currentStatus.canActivate) {
      return res.status(400).json({
        success: false,
        status: currentStatus.status,
        error: currentStatus.message,
      });
    }

    await runCheckAllAccountsFlow({
      runCheckForAccountId,
      includeAutoAssign: false,
      logPrefix: "[renew-adobe][website-activate]",
    }).catch((error) => {
      logger.warn("[renew-adobe] website activate pre-check-all failed", {
        email,
        error: error.message,
      });
    });

    const activated = await assignUserToAvailableAccount(email);
    const nextStatus = await getWebsiteStatusPayload(email, {
      refreshMatchedAccount: true,
    });

    return res.json({
      ...nextStatus,
      success: true,
      message: nextStatus.profileName
        ? `Đã kích hoạt thành công profile ${nextStatus.profileName}.`
        : `Đã kích hoạt thành công cho ${email}.`,
      activatedAccount: {
        id: activated.accountId,
        email: activated.accountEmail,
      },
    });
  } catch (error) {
    logger.error("[renew-adobe] website activate failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message || "Không thể kích hoạt Renew Adobe lúc này.",
    });
  }
};

module.exports = {
  getWebsiteStatusPayload,
  getWebsiteStatus,
  activateWebsiteUser,
};
