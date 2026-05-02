const ACTIVE_LICENSE_STATUSES = new Set(["paid", "active"]);
const { resolveAccountSeatLimit } = require("./usersSnapshotUtils");

function normalizeLicenseStatus(value) {
  return String(value || "unknown").trim().toLowerCase() || "unknown";
}

/** Còn gói theo cột license_status (không phụ thuộc chữ hoa/thường). */
function isPaidLikeLicenseStatus(value) {
  return ACTIVE_LICENSE_STATUSES.has(normalizeLicenseStatus(value));
}

/**
 * Chỉ purge tài khoản khi trạng thái rõ ràng là không còn gói.
 * Không purge khi `unknown` (check không chốt được) để tránh xóa nhầm.
 */
function shouldPurgeAdobeAccountByLicenseStatus(value, account = null) {
  const n = normalizeLicenseStatus(value);
  if (n === "unknown") return false;
  if (ACTIVE_LICENSE_STATUSES.has(n)) return false;

  const contractActiveLicenseCount = Number(resolveAccountSeatLimit(account) || 0);
  // Safe-guard: nếu còn license count > 0 thì chưa purge account để tránh xóa nhầm.
  if (contractActiveLicenseCount > 0) return false;

  return true;
}

function resolveUserProductState(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const raw = user.product;
  if (raw === false || raw === 0) {
    return false;
  }
  if (raw === true || raw === 1) {
    return true;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
  }

  if (raw == null) {
    return null;
  }

  return Boolean(raw);
}

function toDateOnly(dateValue) {
  if (!dateValue) {
    return null;
  }

  if (dateValue instanceof Date) {
    const next = new Date(dateValue);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  if (typeof dateValue === "string") {
    const trimmed = dateValue.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function isOrderExpired(dateValue, now = new Date()) {
  const expiryDate = toDateOnly(dateValue);
  if (!expiryDate) {
    return false;
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
}

function formatDateToDMY(dateValue) {
  const parsed = toDateOnly(dateValue);
  if (!parsed) {
    return null;
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function isAccountEnabled(value) {
  if (value === false || value === 0 || value === "0") {
    return false;
  }

  if (typeof value === "string" && value.trim().toLowerCase() === "false") {
    return false;
  }

  return true;
}

function buildWebsiteStatusPayload({
  email,
  order,
  account,
  matchedUser,
  now = new Date(),
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const profileName = account?.org_name ?? null;
  const licenseStatus = normalizeLicenseStatus(account?.license_status);
  const accountIsActive = account ? isAccountEnabled(account.is_active) : false;
  const accountLicenseCount = Number(resolveAccountSeatLimit(account) || 0);
  const userHasProduct = resolveUserProductState(matchedUser);
  const orderExpired = order ? isOrderExpired(order.expiry_date, now) : false;
  const hasValidOrder = Boolean(order) && !orderExpired;
  const userOnTeam = matchedUser != null;
  const adminLicenseOk =
    Boolean(account) &&
    accountIsActive &&
    ACTIVE_LICENSE_STATUSES.has(licenseStatus);

  let status = "needs_activation";
  if (!order) {
    status = "no_order";
  } else if (orderExpired) {
    status = "order_expired";
  } else if (adminLicenseOk && userOnTeam) {
    // Đơn còn hạn + admin còn gói + email đã có trong team (kể cả chưa gán product)
    status = "active";
  } else {
    status = "needs_activation";
  }

  const rawAccessUrl =
    account?.access_url ??
    account?.url_access ??
    account?.urlAccess ??
    null;
  const urlAccessRaw = rawAccessUrl != null ? String(rawAccessUrl).trim() : "";
  const urlAccess = urlAccessRaw || null;

  const profileLabel = profileName ? `Profile ${profileName}` : "Profile hiện tại";
  let message = "Không thể xác định trạng thái profile.";

  if (status === "active") {
    if (userHasProduct === true) {
      message = "Profile đang hoạt động bình thường.";
    } else {
      message =
        "Đơn còn hiệu lực và tài khoản admin còn gói. Bạn đã có trên profile — mở liên kết bên dưới để hoàn tất nhận sản phẩm Adobe (Team / lời mời).";
    }
  } else if (status === "no_order") {
    message = "Không tìm thấy đơn Renew Adobe còn hiệu lực cho email này.";
  } else if (status === "order_expired") {
    const expiryText = formatDateToDMY(order?.expiry_date);
    message = expiryText
      ? `Gói Renew Adobe đã hết hạn sử dụng (Hạn: ${expiryText}).`
      : "Gói Renew Adobe đã hết hạn sử dụng.";
  } else if (!account) {
    message =
      "Chưa thấy email này được add vào profile nào. Bấm nút bên dưới để kích hoạt.";
  } else if (!userOnTeam) {
    message =
      "Chưa thấy email này trong team profile. Bấm nút bên dưới để kích hoạt.";
  } else if (!accountIsActive) {
    message = `${profileLabel} hiện đang bị tắt. Bấm nút bên dưới để kích hoạt lại.`;
  } else if (!ACTIVE_LICENSE_STATUSES.has(licenseStatus)) {
    message = `${profileLabel} hiện không còn gói. Bấm nút bên dưới để kích hoạt lại.`;
  }

  return {
    success: true,
    email: normalizedEmail,
    status,
    canActivate: status === "needs_activation",
    profileName,
    message,
    order: order
      ? {
          orderCode: order.order_code ?? null,
          expiryDate: order.expiry_date ?? null,
          isExpired: orderExpired,
          status: order.status ?? null,
        }
      : null,
    account: account
      ? {
          id: Number(account.id) || 0,
          email: account.email ?? null,
          orgName: profileName,
          licenseStatus,
          licenseCount: accountLicenseCount,
          userCount: Number(account.user_count) || 0,
          isActive: accountIsActive,
          userHasProduct,
          urlAccess,
        }
      : null,
  };
}

module.exports = {
  ACTIVE_LICENSE_STATUSES,
  normalizeLicenseStatus,
  isPaidLikeLicenseStatus,
  shouldPurgeAdobeAccountByLicenseStatus,
  resolveUserProductState,
  isOrderExpired,
  formatDateToDMY,
  buildWebsiteStatusPayload,
};
