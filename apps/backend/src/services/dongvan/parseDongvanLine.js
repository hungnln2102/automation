const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isDongvanClientId(value) {
  return UUID_RE.test(String(value || "").trim());
}

function isMsRefreshToken(value) {
  const token = String(value || "").trim();
  return token.startsWith("M.") && token.length > 20;
}

function findRefreshTokenPart(parts) {
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    if (isMsRefreshToken(parts[i])) return parts[i];
  }
  if (parts.length >= 2 && !isDongvanClientId(parts[parts.length - 2])) {
    return parts[parts.length - 2];
  }
  return null;
}

/**
 * Parse DongVan mail line, e.g.
 * email|password|extra|M.C528_...|9e5f94bc-e8a4-4e73-b8be-63364c29d753
 * or oauth2 only: refresh_token|client_id
 */
function parseDongvanLine(raw) {
  const line = String(raw || "").trim();
  if (!line || !line.includes("|")) return null;

  const parts = line.split("|").map((part) => part.trim());
  if (parts.length < 2) return null;

  const clientId = parts[parts.length - 1];
  if (!isDongvanClientId(clientId)) return null;

  const refreshToken = findRefreshTokenPart(parts);
  if (!refreshToken) return null;

  const mailEmail = EMAIL_RE.test(parts[0]) ? parts[0].toLowerCase() : null;
  const mailPassword = mailEmail && parts[1] ? parts[1] : null;

  return {
    mailEmail,
    mailPassword,
    refreshToken,
    clientId,
  };
}

function resolveDongvanOAuthInput(refreshToken, clientId) {
  const rt = String(refreshToken ?? "").trim();
  const cid = String(clientId ?? "").trim();

  if (rt.includes("|")) {
    const parsed = parseDongvanLine(rt);
    if (parsed?.refreshToken && parsed?.clientId) {
      return parsed;
    }
  }

  if (rt && cid) {
    return {
      mailEmail: null,
      mailPassword: null,
      refreshToken: rt,
      clientId: cid,
    };
  }

  return {
    mailEmail: null,
    mailPassword: null,
    refreshToken: rt || null,
    clientId: cid || null,
  };
}

function resolveDongvanOAuthFromBody(body) {
  const line =
    body?.dongvan_line ??
    body?.dongvanLine ??
    body?.otp_dongvan_line ??
    "";
  const lineParsed = line ? parseDongvanLine(line) : null;
  if (lineParsed?.refreshToken && lineParsed?.clientId) {
    return {
      refreshToken: lineParsed.refreshToken,
      clientId: lineParsed.clientId,
      mailEmail: lineParsed.mailEmail,
    };
  }

  const resolved = resolveDongvanOAuthInput(
    body?.otp_refresh_token ?? body?.refresh_token,
    body?.otp_client_id ?? body?.client_id
  );

  const mailEmail =
    String(body?.otp_mail_email ?? body?.mail_email ?? "").trim().toLowerCase() ||
    resolved?.mailEmail ||
    null;

  return {
    refreshToken: resolved?.refreshToken ?? null,
    clientId: resolved?.clientId ?? null,
    mailEmail,
  };
}

module.exports = {
  parseDongvanLine,
  resolveDongvanOAuthInput,
  resolveDongvanOAuthFromBody,
  isDongvanClientId,
};
