import { UserOrdersTable } from "@/features/renew-adobe/components/UserOrdersTable";
import { useRenewAdobeAdmin } from "@/features/renew-adobe/hooks/useRenewAdobeAdmin";
import { Link } from "react-router-dom";

/**
 * Bàn làm việc: đơn Renew — gom user/đơn/ gói (cùng API với bảng trong Renew Adobe đầy đủ).
 */
export default function RenewOrdersDeskPage() {
  const { accounts } = useRenewAdobeAdmin();

  const accountsRefreshDep = accounts
    .map(
      (a) =>
        `${a.id}:${a.tracking_user_count ?? 0}:${a.user_count}:${a.license_status}`
    )
    .join("|");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Đơn Renew Adobe</h1>
          <p className="mt-1 text-sm text-white/55">
            Mã đơn, khách, trạng thái gói — đồng bộ storefront Renew.
          </p>
        </div>
        <Link
          to="/renew-adobe-admin"
          className="shrink-0 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
        >
          Mở Renew Adobe đầy đủ
        </Link>
      </div>

      <UserOrdersTable accountsRefreshDep={accountsRefreshDep} />
    </div>
  );
}
