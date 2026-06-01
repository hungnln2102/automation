const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedDongvanLine = {
  mailEmail: string | null;
  mailPassword: string | null;
  refreshToken: string;
  clientId: string;
};

function isDongvanClientId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function isMsRefreshToken(value: string): boolean {
  const token = value.trim();
  return token.startsWith("M.") && token.length > 20;
}

function findRefreshTokenPart(parts: string[]): string | null {
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    if (isMsRefreshToken(parts[i])) return parts[i];
  }
  if (parts.length >= 2 && !isDongvanClientId(parts[parts.length - 2])) {
    return parts[parts.length - 2];
  }
  return null;
}

/** email|password|...|M.C528_...|uuid hoặc refresh_token|client_id */
export function parseDongvanLine(raw: string): ParsedDongvanLine | null {
  const line = raw.trim();
  if (!line || !line.includes("|")) return null;

  const parts = line.split("|").map((part) => part.trim());
  if (parts.length < 2) return null;

  const clientId = parts[parts.length - 1];
  if (!isDongvanClientId(clientId)) return null;

  const refreshToken = findRefreshTokenPart(parts);
  if (!refreshToken) return null;

  const mailEmail = EMAIL_RE.test(parts[0]) ? parts[0].toLowerCase() : null;
  const mailPassword = mailEmail && parts[1] ? parts[1] : null;

  return { mailEmail, mailPassword, refreshToken, clientId };
}

export function resolveDongvanOAuthInput(
  refreshToken: string,
  clientId: string,
): ParsedDongvanLine | null {
  const rt = refreshToken.trim();
  const cid = clientId.trim();

  if (rt.includes("|")) {
    return parseDongvanLine(rt);
  }

  if (rt && cid) {
    return {
      mailEmail: null,
      mailPassword: null,
      refreshToken: rt,
      clientId: cid,
    };
  }

  return null;
}
