const MAX_OPEN_RATIO = 0.9999;
const MIN_PRICE_DENOMINATOR = 0.0001;

const toFiniteNumberOrNull = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const clampOpenRatio = (value: number): number =>
  Math.min(MAX_OPEN_RATIO, Math.max(0, value));

export const getMarginRatioInput = (value: unknown): number | null => {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null || numeric < 0) return null;
  if (numeric === 0) return 0;

  if (numeric >= 1) {
    return null;
  }

  return clampOpenRatio(numeric);
};

export const normalizeMarginRatioInput = (
  value: unknown,
  fallback = 0
): number => {
  const normalized = getMarginRatioInput(value);
  if (normalized === null) {
    return clampOpenRatio(fallback);
  }
  return normalized;
};

export const getDiscountRatioInput = (value: unknown): number | null => {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null || numeric < 0) return null;

  const ratio = numeric > 1 ? numeric / 100 : numeric;
  if (ratio < 0 || ratio >= 1) {
    return null;
  }

  return clampOpenRatio(ratio);
};

export const normalizeDiscountRatioInput = (value: unknown): number =>
  getDiscountRatioInput(value) ?? 0;

export const calculateSellingPriceFromMarginInput = (
  basePrice?: number | null,
  marginInput?: unknown
): number | null => {
  if (
    typeof basePrice !== "number" ||
    !Number.isFinite(basePrice) ||
    basePrice <= 0
  ) {
    return null;
  }

  const marginRatio = getMarginRatioInput(marginInput);
  if (marginRatio === null) {
    return null;
  }

  const denominator = Math.max(MIN_PRICE_DENOMINATOR, 1 - marginRatio);
  return basePrice / denominator;
};

export const formatNormalizedPercent = (
  ratio?: number | null
): string | null => {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) {
    return null;
  }

  const percent = ratio * 100;
  const rounded =
    Math.abs(percent - Math.round(percent)) < 0.01
      ? Math.round(percent).toString()
      : percent.toFixed(2).replace(/\.?0+$/, "");

  return `${rounded}%`;
};
