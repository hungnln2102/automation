import { useState } from "react";
import {
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { ResponsiveTable, TableCard } from "@/components/ui/ResponsiveTable";
import Pagination from "@/components/ui/Pagination";
import { maskPassword } from "../utils/accountUtils";
import type { AdobeAdminAccount } from "../types";
import { StatusBadge } from "./StatusBadge";
import { UrlAccessCell } from "./UrlAccessCell";
import { EditAccountModal } from "./EditAccountModal";

/** x = số dòng order_user_tracking khớp org; y = user_count (slot license). */
function formatSlotRatio(account: AdobeAdminAccount): string {
  const x = account.tracking_user_count ?? 0;
  const y = Number(account.user_count) || 0;
  return `${x}/${y}`;
}

export type RenewAdobeAccountsTableProps = {
  accounts: AdobeAdminAccount[];
  currentRows: AdobeAdminAccount[];
  currentPage: number;
  totalItems: number;
  pageSize: number;
  searchTerm: string;
  loading: boolean;
  error: string | null;
  checkError: string | null;
  checkingId: number | null;
  deletingAdminAccountId: number | null;
  isCheckingAll: boolean;
  checkingIds?: Set<number>;
  onSearchTermChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onCheck: (account: AdobeAdminAccount) => void;
  onDeleteAdmin: (account: AdobeAdminAccount) => void;
  onSaveUrlAccess: (accountId: number, url: string) => void;
  onRefresh?: () => void;
};

export function RenewAdobeAccountsTable({
  accounts,
  currentRows,
  currentPage,
  totalItems,
  pageSize,
  searchTerm,
  loading,
  error,
  checkError,
  checkingId,
  deletingAdminAccountId,
  isCheckingAll,
  checkingIds,
  onSearchTermChange,
  onPageChange,
  onCheck,
  onDeleteAdmin,
  onSaveUrlAccess,
  onRefresh,
}: RenewAdobeAccountsTableProps) {
  const start = (currentPage - 1) * pageSize;
  const [editingAccount, setEditingAccount] = useState<AdobeAdminAccount | null>(null);
  const otpSourceLabel = (source?: AdobeAdminAccount["otp_source"]) => {
    if (source === "tinyhost") return "TinyHost";
    if (source === "hdsd") return "otp.hdsd.net";
    return "IMAP";
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] bg-gradient-to-br from-slate-800/65 via-slate-700/55 to-slate-900/65 border border-white/15 p-4 lg:p-5 shadow-[0_20px_55px_-30px_rgba(0,0,0,0.7),0_14px_34px_-26px_rgba(255,255,255,0.2)] backdrop-blur-sm">
        <div className="relative w-full max-w-md">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-300/70 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm theo email, alias, org, id product..."
            className="w-full pl-11 pr-4 py-2.5 border border-white/10 rounded-2xl bg-slate-950/40 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 outline-none transition-all placeholder:text-slate-400/70"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-[18px] bg-gradient-to-br from-indigo-900/70 via-slate-900/70 to-slate-950/70 border border-white/12 shadow-[0_20px_65px_-30px_rgba(0,0,0,0.85)] overflow-hidden">
        {error && (
          <div className="p-4 bg-rose-500/10 border-b border-rose-400/20 text-rose-300 text-sm">
            {error}
          </div>
        )}
        {checkError && (
          <div className="p-4 bg-amber-500/10 border-b border-amber-400/20 text-amber-300 text-sm">
            {checkError}
          </div>
        )}
        {loading ? (
          <div className="p-12 text-center text-white/70">
            Đang tải danh sách...
          </div>
        ) : (
          <ResponsiveTable
            showCardOnMobile
            cardView={
              currentRows.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-white/70 text-lg mb-2">
                    {accounts.length === 0
                      ? "Chưa có tài khoản nào"
                      : "Không tìm thấy tài khoản nào"}
                  </p>
                  <p className="text-white/60 text-sm">
                    {accounts.length === 0
                      ? "Thêm tài khoản vào bảng system_automation.accounts_admin"
                      : "Thử thay đổi từ khóa tìm kiếm"}
                  </p>
                </div>
              ) : (
                <TableCard
                  data={currentRows}
                  renderCard={(item, idx) => {
                    const account = item as AdobeAdminAccount;
                    return (
                      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                        <p className="text-xs text-white/50">#{start + idx + 1}</p>
                        <p className="text-sm font-medium text-white break-all">
                          {account.email}
                        </p>
                        <p className="text-xs text-white/60">
                          Mật khẩu: {maskPassword(account.password_encrypted)}
                        </p>
                        <p className="text-xs text-white/70 break-all">OTP</p>
                        <p className="text-xs text-white/70 break-all">
                          Nguồn OTP: {otpSourceLabel(account.otp_source)}
                        </p>
                        <p className="text-xs text-white/70 break-all">
                          Alias: {account.alias ?? "—"}
                        </p>
                        <p className="text-xs text-white/70">
                          Org: {account.org_name ?? "—"}
                        </p>
                        <p className="text-xs text-white/70 break-all">
                          ID Product: {account.id_product ?? "—"}
                        </p>
                        <p className="text-xs text-white/70">
                          Slot (user tracking / license): {formatSlotRatio(account)}
                        </p>
                        <StatusBadge
                          status={account.license_status}
                          account={account}
                        />
                        <div className="mt-2 flex flex-nowrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onCheck(account)}
                            disabled={
                              checkingId !== null ||
                              isCheckingAll ||
                              deletingAdminAccountId !== null
                            }
                            title="Check"
                            aria-label="Check account"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 disabled:opacity-50"
                          >
                            {checkingId === account.id ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <EyeIcon className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAccount(account)}
                            title="Sửa"
                            aria-label="Sửa account"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/35"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAdmin(account)}
                            disabled={
                              checkingId !== null ||
                              isCheckingAll ||
                              deletingAdminAccountId !== null
                            }
                            title="Xóa"
                            aria-label="Xóa account"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300 border border-rose-400/35 disabled:opacity-50"
                          >
                            {deletingAdminAccountId === account.id ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <TrashIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
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
                  <th className="min-w-[180px]">EMAIL</th>
                  <th className="min-w-[100px]">PASSWORD</th>
                  <th className="min-w-[120px]">OTP</th>
                  <th className="min-w-[120px]">OTP SOURCE</th>
                  <th className="min-w-[140px]">TEAM</th>
                  <th className="min-w-[120px]">ID PRODUCT</th>
                  <th className="w-28 text-center" title="user tracking / user_count">
                    SLOT
                  </th>
                  <th className="w-36">LICENSE</th>
                  <th className="w-20 text-center">LINK PRODUCT</th>
                  <th className="w-28 text-center">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {currentRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-12 text-center text-white/70"
                    >
                      <p className="text-lg mb-2">
                        {accounts.length === 0
                          ? "Chưa có tài khoản nào"
                          : "Không tìm thấy tài khoản nào"}
                      </p>
                      <p className="text-sm text-white/60">
                        {accounts.length === 0
                          ? "Thêm tài khoản vào bảng system_automation.accounts_admin"
                          : "Thử thay đổi từ khóa tìm kiếm"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  currentRows.map((item) => {
                    const account = item as AdobeAdminAccount;
                    const isBeingChecked = checkingIds?.has(account.id) ?? false;

                    return (
                      <tr
                        key={account.id}
                        className={isBeingChecked ? "bg-indigo-500/10 animate-pulse" : ""}
                      >
                        <td className="px-2 sm:px-4 py-3 text-sm text-white/90 break-all">
                          {account.email}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-sm text-white/60 font-mono">
                          {maskPassword(account.password_encrypted)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-sm text-white/80 break-all max-w-[200px]">
                          <p className="text-xs text-white/70">{account.alias ?? "—"}</p>
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-sm text-white/80">
                          {otpSourceLabel(account.otp_source)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-sm text-white/80">
                          {account.org_name ?? "—"}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-sm text-white/80 font-mono text-xs break-all max-w-[220px]">
                          {account.id_product ?? "—"}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-sm text-white/80 text-center tabular-nums whitespace-nowrap">
                          {formatSlotRatio(account)}
                        </td>
                        <td className="px-2 sm:px-4 py-3">
                          <StatusBadge
                            status={account.license_status}
                            account={account}
                          />
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center">
                          <UrlAccessCell
                            value={account.access_url ?? ""}
                            onSave={(url) => onSaveUrlAccess(account.id, url)}
                          />
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center">
                          <div className="inline-flex flex-nowrap items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onCheck(account)}
                              disabled={
                                checkingId !== null ||
                                isCheckingAll ||
                                deletingAdminAccountId !== null
                              }
                              title={
                                checkingId === account.id
                                  ? "Đang check..."
                                  : isBeingChecked
                                    ? "Checking..."
                                    : "Check"
                              }
                              aria-label="Check account"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {checkingId === account.id
                                ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                : isBeingChecked
                                  ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                  : <EyeIcon className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAccount(account)}
                              title="Sửa"
                              aria-label="Sửa account"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/35 hover:bg-amber-500/25"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteAdmin(account)}
                              disabled={
                                checkingId !== null ||
                                isCheckingAll ||
                                deletingAdminAccountId !== null
                              }
                              title={deletingAdminAccountId === account.id ? "Đang xóa..." : "Xóa"}
                              aria-label="Xóa account"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300 border border-rose-400/35 hover:bg-rose-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingAdminAccountId === account.id
                                ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                : <TrashIcon className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        )}

        {!loading && totalItems > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-white/10 bg-slate-900/85 px-4 py-3 sm:px-6">
            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={onPageChange}
            />
          </div>
        )}
      </div>
      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={() => onRefresh?.()}
        />
      )}
    </div>
  );
}
