const crypto = require("crypto");
/** Native bcrypt (~nhanh hơn bcryptjs đáng kể trên VPS khi POST /login so khớp mật khẩu). */
const bcrypt = require("bcrypt");
const { db } = require("../../db");
const {
  ADMIN_SCHEMA,
  getDefinition,
  tableName,
  SCHEMA_ADMIN,
} = require("../../config/dbSchema");
const { session: sessionConfig } = require("../../config/appConfig");
const logger = require("../../utils/logger");

const USERS_DEF = getDefinition("USERS", ADMIN_SCHEMA);
const USERS_TABLE = tableName(USERS_DEF.tableName, SCHEMA_ADMIN);

/** Cost cho hash *mới* (compare vẫn dùng cost ghi trong hash cũ). Env BCRYPT_COST 4–12, mặc định 10. */
function bcryptSaltRounds() {
  const n = Number.parseInt(process.env.BCRYPT_COST || "", 10);
  if (Number.isFinite(n) && n >= 4 && n <= 12) {
    return n;
  }
  return 10;
}

async function hashPasswordPlain(plain) {
  return bcrypt.hash(String(plain), bcryptSaltRounds());
}

/**
 * So sánh mật khẩu với hash đã lưu.
 * - Bcrypt hash ($2a/$2b): dùng bcrypt.compare (timing-safe).
 * - Legacy plaintext: dùng crypto.timingSafeEqual để tránh timing attack.
 *   Trả thêm flag `needsUpgrade` để caller tự upgrade lên bcrypt.
 */
const verifyPassword = async (inputPassword, storedValue) => {
  const hashString =
    storedValue instanceof Buffer
      ? storedValue.toString()
      : String(storedValue || "");

  if (hashString.startsWith("$2")) {
    return { match: await bcrypt.compare(inputPassword, hashString), needsUpgrade: false };
  }

  if (!hashString) {
    return { match: false, needsUpgrade: false };
  }

  const inputBuf = Buffer.from(String(inputPassword));
  const storedBuf = Buffer.from(hashString);
  if (inputBuf.length !== storedBuf.length) {
    return { match: false, needsUpgrade: true };
  }
  const match = crypto.timingSafeEqual(inputBuf, storedBuf);
  return { match, needsUpgrade: match };
};

const upgradePasswordHash = async (userId, plainPassword) => {
  try {
    const userCols = USERS_DEF.columns;
    const newHash = await hashPasswordPlain(plainPassword);
    await db(USERS_TABLE)
      .where(userCols.id, userId)
      .update({ [userCols.password]: newHash });
    logger.warn("[AUTH] Đã tự động upgrade mật khẩu plaintext lên bcrypt", { userId });
  } catch (err) {
    logger.error("[AUTH] Không thể upgrade mật khẩu", { userId, error: err.message });
  }
};

const SESSION_COOKIE_MS = 1000 * 60 * 60 * 1; // 1 giờ — phiên ngắn

function applySessionDuration(req) {
  req.session.cookie.maxAge = SESSION_COOKIE_MS;
}

const login = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      error: "Tên đăng nhập và mật khẩu là bắt buộc",
    });
  }
  const normalizedUsername = String(username).trim().toLowerCase();
  const normalizedPassword = String(password).trim();

  try {
    const userCols = USERS_DEF.columns;
    const user = await db(USERS_TABLE)
      .select({
        userid: userCols.id,
        username: userCols.username,
        passwordhash: userCols.password,
        role: userCols.role,
      })
      .whereRaw(`LOWER("${userCols.username}") = ?`, [normalizedUsername])
      .first();

    if (!user) {
      return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
    }

    const { match: isMatch, needsUpgrade } = await verifyPassword(normalizedPassword, user.passwordhash);
    if (!isMatch) {
      return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
    }

    if (needsUpgrade) {
      await upgradePasswordHash(user.userid, normalizedPassword);
    }

    applySessionDuration(req);
    req.session.user = {
      id: user.userid,
      username: user.username,
      role: user.role || "user",
    };
    return res.json({ user: req.session.user });
  } catch (error) {
    logger.error("[auth] Đăng nhập thất bại", { error: error.message, stack: error.stack, username: normalizedUsername });
    return res
      .status(500)
      .json({ error: "Không thể đăng nhập, vui lòng thử lại sau" });
  }
};

const logout = (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie(sessionConfig?.name);
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
};

const me = (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Không có quyền truy cập" });
  }
  return res.json({ user: req.session.user });
};

const getCsrfToken = (req, res) => {
  const token = req.csrfToken || null;

  if (token) {
    res.cookie("csrf-token", token, {
      httpOnly: false,
      sameSite: sessionConfig.cookieSameSite,
      secure: sessionConfig.cookieSecure === true,
      path: "/",
    });
  }

  return res.json({ csrfToken: token });
};

const changePassword = async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Không có quyền truy cập" });
  }

  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới" });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Mật khẩu mới không khớp" });
  }

  try {
    const userCols = USERS_DEF.columns;
    const sessionUser = req.session.user || {};
    let userQuery = db(USERS_TABLE).select({
      userid: userCols.id,
      username: userCols.username,
      passwordhash: userCols.password,
    });

    if (sessionUser.id && sessionUser.id !== -1) {
      userQuery = userQuery.where(userCols.id, sessionUser.id);
    } else if (sessionUser.username) {
      userQuery = userQuery.whereRaw(`LOWER("${userCols.username}") = ?`, [
        String(sessionUser.username || "").trim().toLowerCase(),
      ]);
    } else {
      return res.status(401).json({ error: "Không có quyền truy cập" });
    }

    const user = await userQuery.first();
    if (!user) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản" });
    }

    const { match: isMatch } = await verifyPassword(currentPassword, user.passwordhash);
    if (!isMatch) {
      return res.status(401).json({ error: "Mật khẩu hiện tại không đúng" });
    }

    const newHash = await hashPasswordPlain(newPassword);
    await db(USERS_TABLE)
      .where(userCols.id, user.userid)
      .update({ [userCols.password]: newHash });

    return res.json({ success: true });
  } catch (error) {
    logger.error("[auth] Thay đổi mật khẩu thất bại", { error: error.message, stack: error.stack, userId: sessionUser.id });
    return res
      .status(500)
      .json({ error: "Không thể thay đổi mật khẩu, vui lòng thử lại sau" });
  }
};

const ensureDefaultAdmin = async () => {
  const usernameEnv = (process.env.DEFAULT_ADMIN_USER || "").trim();
  const passwordEnv = (process.env.DEFAULT_ADMIN_PASS || "").trim();
  if (!usernameEnv || !passwordEnv) return;

  const userCols = USERS_DEF.columns;
  const normalizedUsername = usernameEnv.toLowerCase();
  try {
    const existing = await db(USERS_TABLE)
      .whereRaw(`LOWER("${userCols.username}") = ?`, [normalizedUsername])
      .first();
    if (existing) return;

    await db(USERS_TABLE).insert({
      [userCols.username]: usernameEnv,
      [userCols.password]: await hashPasswordPlain(passwordEnv),
      [userCols.role]: "admin",
    });
    logger.info(`[AUTH] Đã tạo người dùng quản trị`, { username: usernameEnv });
  } catch (err) {
    logger.error("[AUTH] Lỗi khi tạo Admin", { error: err.message, stack: err.stack, username: usernameEnv });
  }
};

module.exports = {
  login,
  logout,
  me,
  getCsrfToken,
  changePassword,
  ensureDefaultAdmin,
};
