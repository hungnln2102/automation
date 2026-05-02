import { hasNoAccountInfo } from "../utils/accountUtils";
import type { AdobeAdminAccount, LicenseStatus } from "../types";

const STATUS_LABELS: Record<LicenseStatus, string> = {
  paid: "Còn gói",
  active: "Đang hoạt động",
  expired: "Hết hạn",
  unknown: "Chờ gia hạn",
};

export type StatusBadgeProps = {
  status: LicenseStatus;
  account?: AdobeAdminAccount | null;
};

export function StatusBadge({ status, account }: StatusBadgeProps) {
  const label =
    account && status === "unknown" && hasNoAccountInfo(account)
      ? "Chờ check"
      : STATUS_LABELS[status];

  const colorClasses =
    status === "paid" || status === "active"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
      : status === "expired"
        ? "bg-rose-500/15 text-rose-300 border-rose-400/40"
        : "bg-amber-500/15 text-amber-300 border-amber-400/40";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${colorClasses}`}
    >
      {label}
    </span>
  );
}
