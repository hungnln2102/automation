/**
 * Bảng hiển thị Mã đơn hàng, Tên Khách Hàng, Email, Tình trạng Gói, Hạn Sử Dụng, Thao Tác.
 *
 * Luồng dữ liệu:
 * 1. order_list lọc theo variant_id thuộc hệ thống renew_adobe (product_system)
 * 2. API trả về order_code, information_order, customer, expiry_date, status
 * 3. Join order_user_tracking + mapping (API) → profile, tình trạng gói
 */

import { useEffect, useMemo, useState } from "react";
import { ResponsiveTable, TableCard } from "@/components/ui/ResponsiveTable";
import Pagination from "@/components/ui/Pagination";
import type { LicenseStatus } from "@/features/renew-adobe/types";
import { fetchRenewAdobeUserOrders } from "@/features/renew-adobe/user-orders/api";
import type {
  DisplayStatus,
  OrderInfo,
  UserOrderRow,
} from "@/features/renew-adobe/user-orders/types";
import { flattenToUserRows } from "@/features/renew-adobe/user-orders/utils";

const STATUS_LABELS: Record<LicenseStatus, string> = {
  paid: "Còn gói",
  active: "Đang hoạt động",
  expired: "Hết hạn",
  unknown: "Chờ gia hạn",
};

/** no_product = chưa cấp quyền Adobe; not_added = chưa gán admin */
const DISPLAY_LABELS: Record<DisplayStatus, string> = {
  ...STATUS_LABELS,
  no_product: "Chưa cấp quyền",
  not_added: "Chưa add",
};

const PAGE_SIZE = 10;

function StatusBadge({ status }: { status: DisplayStatus }) {
  const label = DISPLAY_LABELS[status];
  const colorClasses =
    status === "paid" || status === "active"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
      : status === "expired"
        ? "bg-rose-500/15 text-rose-300 border-rose-400/40"
      : status === "no_product"
        ? "bg-amber-500/15 text-amber-300 border-amber-400/40"
      : status === "not_added"
        ? "bg-slate-500/20 text-slate-300 border-slate-400/35"
        : "bg-amber-500/15 text-amber-300 border-amber-400/40";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${colorClasses}`}
    >
      {label}
    </span>
  );
}

export type UserOrdersTableProps = {
  /** Đổi khi load lại danh sách admin → refetch user-orders (join API). */
  accountsRefreshDep?: string;
  onDeleteUser?: (accountId: number, userEmail: string) => void;
  deletingId?: string | null;
  onFixUser?: (userEmail: string) => void;
  fixingId?: string | null;
  /** Fix tuần tự các user đang hiển thị (theo ô tìm kiếm) có accountId === 0 */
  onFixAllUsers?: (emails: string[]) => void;
  fixAllProgress?: { current: number; total: number } | null;
};

export function UserOrdersTable({
  accountsRefreshDep = "",
  onDeleteUser,
  deletingId,
  onFixUser,
  fixingId,
  onFixAllUsers,
  fixAllProgress,
}: UserOrdersTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [orderData, setOrderData] = useState<OrderInfo[]>([]);

  useEffect(() => {
    fetchRenewAdobeUserOrders()
      .then((data) => setOrderData(data))
      .catch(() => setOrderData([]));
  }, [accountsRefreshDep]);

  const allRows = useMemo(() => flattenToUserRows(orderData), [orderData]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return allRows;
    const q = searchTerm.trim().toLowerCase();
    return allRows.filter(
      (r) =>
        r.order_code.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
    );
  }, [allRows, searchTerm]);

  /** Chưa có adobe_account_id (chưa gán admin) */
  const fixableEmailsInView = useMemo(
    () =>
      filtered.filter((r) => r.accountId === 0).map((r) => r.email),
    [filtered]
  );

  const totalItems = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const currentRows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="rounded-[18px] bg-gradient-to-br from-slate-800/65 via-slate-700/55 to-slate-900/65 border border-white/15 p-4 lg:p-6 shadow-[0_20px_55px_-30px_rgba(0,0,0,0.7)] backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white/90 mb-1">
        Danh sách user & đơn hàng
      </h3>
      <p className="text-xs text-white/50 mb-4">
        Mã đơn hàng, Tên Khách Hàng, Email, Profile, Tình trạng Gói, Hạn Sử Dụng
      </p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder="Tìm theo mã đơn, tên, email..."
          className="w-full max-w-md px-4 py-2 border border-white/10 rounded-xl bg-slate-950/40 text-sm text-white placeholder:text-slate-400/70 focus:ring-2 focus:ring-indigo-500/50 outline-none"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
        />
        {onFixAllUsers && fixableEmailsInView.length > 0 ? (
          <button
            type="button"
            onClick={() => onFixAllUsers(fixableEmailsInView)}
            disabled={
              !!fixingId || !!deletingId || !!fixAllProgress
            }
            className="shrink-0 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/40 px-4 py-2 text-sm font-semibold hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {fixAllProgress
              ? `Đang fix ${fixAllProgress.current}/${fixAllProgress.total}...`
              : `Fix all (${fixableEmailsInView.length})`}
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <ResponsiveTable
          showCardOnMobile
          cardView={
            currentRows.length === 0 ? (
              <div className="p-8 text-center text-white/70">
                Chưa có dữ liệu. Chạy Check để đồng bộ users từ Adobe.
              </div>
            ) : (
              <TableCard
                data={currentRows}
                renderCard={(item) => {
                  const row = item as UserOrderRow;
                  return (
                    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                      <p className="text-xs text-white/60">Mã đơn: {row.order_code}</p>
                      <p className="text-sm font-medium text-white">{row.customer_name}</p>
                      <p className="text-xs text-white/80 break-all">{row.email}</p>
                      <p className="text-xs text-white/60">Profile: {row.profile}</p>
                      <StatusBadge status={row.display_status} />
                      <p className="text-xs text-white/70">Hạn: {row.expiry}</p>
                      {row.accountId > 0 && onDeleteUser && (
                        <button
                          type="button"
                          onClick={() => onDeleteUser(row.accountId, row.email)}
                          disabled={!!deletingId || !!fixingId || !!fixAllProgress}
                          className="mt-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-400/40 px-3 py-1.5 text-xs font-semibold"
                        >
                          Xóa
                        </button>
                      )}
                      {row.accountId === 0 && onFixUser && (
                        <button
                          type="button"
                          onClick={() => onFixUser(row.email)}
                          disabled={!!fixingId || !!deletingId || !!fixAllProgress}
                          className="mt-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/40 px-3 py-1.5 text-xs font-semibold"
                        >
                          {fixingId === row.email ? "Đang fix..." : "Fix"}
                        </button>
                      )}
                    </div>
                  );
                }}
                className="p-4"
              />
            )
          }
        >
          <table className="min-w-full divide-y divide-white/5 text-white">
            <thead>
              <tr className="[&>th]:px-2 [&>th]:sm:px-4 [&>th]:py-3 [&>th]:text-[10px] [&>th]:sm:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.1em] [&>th]:text-indigo-300/70 [&>th]:text-left [&>th]:bg-white/[0.03] [&>th]:whitespace-nowrap">
                <th className="min-w-[120px]">MÃ ĐƠN HÀNG</th>
                <th className="min-w-[160px]">TÊN KHÁCH HÀNG</th>
                <th className="min-w-[200px]">EMAIL</th>
                <th className="min-w-[140px]">PROFILE</th>
                <th className="min-w-[12rem] whitespace-nowrap">TÌNH TRẠNG GÓI</th>
                <th className="min-w-[110px]">HẠN SỬ DỤNG</th>
                <th className="w-24 text-center">THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {currentRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/70">
                    Chưa có dữ liệu. Chạy Check để đồng bộ users từ Adobe.
                  </td>
                </tr>
              ) : (
                currentRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 sm:px-4 py-3 text-sm text-white/80 font-mono">
                      {row.order_code}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-white/90">
                      {row.customer_name}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-white/90 break-all">
                      {row.email}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-white/80">
                      {row.profile}
                    </td>
                    <td className="px-2 sm:px-4 py-3">
                      <StatusBadge status={row.display_status} />
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-white/80">
                      {row.expiry}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-center">
                      {row.accountId > 0 && onDeleteUser && (
                        <button
                          type="button"
                          onClick={() => onDeleteUser(row.accountId, row.email)}
                          disabled={!!deletingId || !!fixingId || !!fixAllProgress}
                          className="rounded-lg bg-rose-500/20 text-rose-300 border border-rose-400/40 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Xóa
                        </button>
                      )}
                      {row.accountId === 0 && onFixUser && (
                        <button
                          type="button"
                          onClick={() => onFixUser(row.email)}
                          disabled={!!fixingId || !!deletingId || !!fixAllProgress}
                          className="rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/40 px-3 py-1.5 text-xs font-semibold hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {fixingId === row.email ? "Đang fix..." : "Fix"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTable>

        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-white/10 bg-slate-900/85 px-4 py-3">
            <Pagination
              currentPage={page}
              totalItems={totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
