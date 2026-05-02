const pad2 = (value: number): string => String(value).padStart(2, "0");

const parseFlexibleDate = (
  value: string | number | Date | null | undefined
): Date | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const stringValue = String(value).trim();
  if (!stringValue) return null;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(stringValue)) {
    const [d, m, y] = stringValue.split("/").map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d);
  }

  // Chỉ YYYY-MM-DD thuần (không có giờ) = ngày lịch theo local, tránh lệch 1 ngày với ISO Z
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [y, m, d] = stringValue.split("-").map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d);
  }

  // ISO có T hoặc timezone — dùng instant rồi lấy ngày theo múi giờ trình duyệt
  if (
    /^\d{4}-\d{2}-\d{2}T/.test(stringValue) ||
    /[zZ]|[+-]\d{2}:?\d{2}$/.test(stringValue)
  ) {
    const parsed = new Date(stringValue);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const parsed = new Date(stringValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

export const convertDMYToYMD = (dmyString: string): string => {
  if (!dmyString || dmyString.indexOf("/") === -1) return dmyString;
  const parts = dmyString.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dmyString;
};

export const getTodayDMY = (): string => {
  const now = Date.now();
  const vnMs = now + 7 * 60 * 60 * 1000;
  const date = new Date(vnMs);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

export const calculateExpirationDate = (
  registerDateStr: string,
  days: number,
  forceDay?: number
): string => {
  if (!registerDateStr || days <= 0) return "N/A";
  const parts = registerDateStr.split("/");
  if (parts.length !== 3) return "N/A";
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days - 1);
  if (Number.isFinite(forceDay) && forceDay! >= 1 && forceDay! <= 31) {
    date.setDate(forceDay!);
  }
  const newDay = String(date.getDate()).padStart(2, "0");
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newYear = date.getFullYear();
  return `${newDay}/${newMonth}/${newYear}`;
};

export const addMonthsMinusOneDay = (
  startDMY: string,
  months: number,
  forceDay?: number
): string => {
  if (!startDMY || !Number.isFinite(months) || months <= 0) return startDMY;
  const [d, m, y] = startDMY.split("/").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  dt.setDate(dt.getDate() - 1);
  if (Number.isFinite(forceDay) && forceDay! >= 1 && forceDay! <= 31) {
    dt.setDate(forceDay!);
  }
  return `${String(dt.getDate()).padStart(2, "0")}/${String(
    dt.getMonth() + 1
  ).padStart(2, "0")}/${dt.getFullYear()}`;
};

export const inclusiveDaysBetween = (
  startDMY: string,
  endDMY: string
): number => {
  const [sd, sm, sy] = startDMY.split("/").map(Number);
  const [ed, em, ey] = endDMY.split("/").map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.floor((e.getTime() - s.getTime()) / msPerDay);
  return diff + 1;
};

export const formatDateToDMY = (
  value: string | number | Date | null | undefined
): string => {
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return "";
    // Chỉ tối ưu chuỗi date-only; chuỗi có giờ (…T…Z) phải qua parseFlexibleDate
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const [, y, mo, d] = m;
        return `${d}/${mo}/${y}`;
      }
    }
    const m2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (m2) {
      const [, y, mo, d] = m2;
      return `${d}/${mo}/${y}`;
    }
  }
  const date = parseFlexibleDate(value);
  if (!date) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const isRegisteredToday = (
  value: string | number | Date | null | undefined
): boolean => {
  const date = parseFlexibleDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date.getTime() === today.getTime();
};

export const daysUntilDate = (
  value: string | number | Date | null | undefined
): number | null => {
  const date = parseFlexibleDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date.getTime() - today.getTime()) / msPerDay);
};

export const parseMonthsFromInfo = (info?: string): number => {
  if (!info) return 0;
  const m = info.match(/--(\d+)m/i);
  if (!m) return 0;
  const months = Number(m[1] || 0);
  return Number.isFinite(months) && months > 0 ? months : 0;
};

export const daysFromMonths = (months: number): number => {
  if (!Number.isFinite(months) || months <= 0) return 0;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return years * 365 + remainder * 30;
};
