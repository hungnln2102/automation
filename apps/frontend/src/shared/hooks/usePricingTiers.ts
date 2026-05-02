import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ORDER_CODE_PREFIXES } from "@/constants";
import { apiFetch } from "../api/client";

export interface PricingTier {
  id: number;
  key: string;
  prefix: string;
  label: string;
  pricing_rule: "markup" | "discount" | "fixed_zero" | "cost";
  base_tier_key: string | null;
  sort_order: number;
  is_active: boolean;
}

/** Option cho dropdown mã / loại đơn (CreateOrder, v.v.) — kèm key tier để lọc theo nghiệp vụ. */
export type OrderCodeSelectOption = {
  value: string;
  label: string;
  /** Khóa tier trong bảng pricing: ví dụ `import` = nhập hàng (MAVN), không phụ thuộc cách lưu `prefix`. */
  tierKey: string;
};

/** Loại «nhập hàng»: theo `key` tier (ổn định) hoặc prefix MAVN (kể cả lệch hoa thường từ API). */
export function isImportOrderCodeOption(
  o: OrderCodeSelectOption
): boolean {
  if (o.tierKey === "import") return true;
  return (
    String(o.value || "").trim().toUpperCase() ===
    String(ORDER_CODE_PREFIXES.IMPORT).toUpperCase()
  );
}

const STALE_MS = 10 * 60_000;

let _sharedCache: PricingTier[] | null = null;
let _sharedTs = 0;

export function usePricingTiers() {
  const [tiers, setTiers] = useState<PricingTier[]>(_sharedCache ?? []);
  const [loading, setLoading] = useState(!_sharedCache);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchTiers = useCallback(async (force = false) => {
    if (!force && _sharedCache && Date.now() - _sharedTs < STALE_MS) {
      setTiers(_sharedCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/pricing-tiers");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PricingTier[] = await res.json();
      _sharedCache = data;
      _sharedTs = Date.now();
      if (mounted.current) {
        setTiers(data);
        setError(null);
      }
    } catch (err: any) {
      if (mounted.current) setError(err.message ?? "Fetch failed");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchTiers();
    return () => { mounted.current = false; };
  }, [fetchTiers]);

  const prefixMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tiers) {
      if (t.is_active) map[t.key] = t.prefix;
    }
    return map;
  }, [tiers]);

  const orderCodeOptions = useMemo(
    () =>
      tiers
        .filter((t) => t.is_active)
        .map(
          (t): OrderCodeSelectOption => ({
            value: t.prefix,
            label: t.label,
            tierKey: t.key,
          })
        ),
    [tiers]
  );

  return { tiers, loading, error, refetch: fetchTiers, prefixMap, orderCodeOptions };
}
