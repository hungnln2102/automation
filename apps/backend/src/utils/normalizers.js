const normalizeDateInput = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  // If value already contains a YYYY-MM-DD, keep only the date part
  const ymdMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch) return ymdMatch[1];
  const ymdSlashMatch = trimmed.match(/^(\d{4}\/\d{2}\/\d{2})/);
  if (ymdSlashMatch) return ymdSlashMatch[1].replace(/\//g, "-");

  // Convert DD/MM/YYYY ➜ YYYY-MM-DD
  const dmyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;

  // Convert DD-MM-YYYY ➜ YYYY-MM-DD
  const dmyDashMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmyDashMatch) return `${dmyDashMatch[3]}-${dmyDashMatch[2]}-${dmyDashMatch[1]}`;

  const yyyymmdd = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;

  return trimmed;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeTextInput = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const trimToLength = (value, maxLength = 255) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.length <= maxLength ? str : str.slice(0, maxLength);
};

const todayYMDInVietnam = () => {
  // Vietnam time is UTC+7 with no DST
  const now = Date.now();
  const vnMs = now + 7 * 60 * 60 * 1000;
  const d = new Date(vnMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Ngày lịch (YYYY-MM-DD) theo múi Việt Nam tại một mốc thời gian (timestamptz / Date / ISO). */
const ymdInVietnamFromInstant = (value) => {
  if (value === undefined || value === null) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  const vnMs = t + 7 * 60 * 60 * 1000;
  const d = new Date(vnMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDateOutput = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Ngày lịch thuần YYYY-MM-DD — không đụng múi giờ
    let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    // ISO có giờ — map sang ngày theo lịch Việt Nam (UTC+7)
    const asInstant = Date.parse(trimmed);
    if (!Number.isNaN(asInstant)) {
      return ymdInVietnamFromInstant(asInstant);
    }
    return trimmed;
  }
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return null;
  return ymdInVietnamFromInstant(dateValue);
};

const formatYMDToDMY = (value) => {
  if (!value) return "";
  const str = String(value).trim();
  if (!str) return "";
  let match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  match = str.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  match = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return "";
};

const normalizeCheckFlagValue = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "t", "1", "yes"].includes(lowered)) return true;
    if (["false", "f", "0", "no"].includes(lowered)) return false;
    if (["null", "undefined", ""].includes(lowered)) return null;
  }
  return null;
};

const normalizeStatusKey = (value) => {
  if (value === undefined || value === null) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
};

const normalizeSupplyStatus = (value) => {
  if (value === undefined || value === null) return "hoat dong";
  const normalized = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return "hoat dong";
  if (["active", "dang hoat dong", "hoat dong", "running"].includes(normalized)) {
    return "hoat dong";
  }
  if (["inactive", "tam ngung", "tam dung", "pause", "paused"].includes(normalized)) {
    return "tam dung";
  }
  return normalized;
};

const parseDbBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  return ["true", "1", "t", "y", "yes"].includes(normalized);
};

const fromDbNumber = (value) => {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const getRowId = (row, ...keys) => {
  if (!row) return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const value = Number(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
};

const hasMeaningfulValue = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

const hasAccountStoragePayload = (payload = {}) => {
  const { accountUser, accountPass, accountMail, accountNote, capacity } = payload;
  if (
    hasMeaningfulValue(accountUser) ||
    hasMeaningfulValue(accountPass) ||
    hasMeaningfulValue(accountMail) ||
    hasMeaningfulValue(accountNote)
  ) {
    return true;
  }
  if (capacity !== undefined && capacity !== null && capacity !== "") {
    return true;
  }
  return false;
};

module.exports = {
  normalizeDateInput,
  toNullableNumber,
  normalizeTextInput,
  trimToLength,
  todayYMDInVietnam,
  ymdInVietnamFromInstant,
  formatDateOutput,
  formatYMDToDMY,
  normalizeCheckFlagValue,
  normalizeStatusKey,
  normalizeSupplyStatus,
  parseDbBoolean,
  fromDbNumber,
  getRowId,
  hasMeaningfulValue,
  hasAccountStoragePayload,
};
