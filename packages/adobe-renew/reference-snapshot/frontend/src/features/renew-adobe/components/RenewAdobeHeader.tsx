import type { MouseEventHandler } from "react";

export type RenewAdobeHeaderProps = {
  isCheckingAll: boolean;
  loading: boolean;
  accountCount: number;
  checkingId: number | null;
  cronTestLoading: boolean;
  onCheckAll: MouseEventHandler<HTMLButtonElement>;
  onCancelCheckAll: MouseEventHandler<HTMLButtonElement>;
  onTestCronJob: MouseEventHandler<HTMLButtonElement>;
  onAddAdmin?: MouseEventHandler<HTMLButtonElement>;
};

export function RenewAdobeHeader({
  isCheckingAll,
  loading,
  accountCount,
  checkingId,
  cronTestLoading,
  onCheckAll,
  onCancelCheckAll,
  onTestCronJob,
  onAddAdmin,
}: RenewAdobeHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Renew <span className="text-indigo-400">Adobe</span>
        </h1>
        <p className="text-sm font-medium text-white/50 tracking-wide">
          Danh sách tài khoản admin dùng cho Renew Adobe
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {onAddAdmin && (
          <button
            type="button"
            onClick={onAddAdmin}
            disabled={loading || checkingId !== null || cronTestLoading}
            className="rounded-xl bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            + Thêm tài khoản admin
          </button>
        )}
        {isCheckingAll ? (
          <button
            type="button"
            onClick={onCancelCheckAll}
            className="rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/40 px-4 py-2 text-sm font-semibold hover:bg-rose-500/30 transition-colors"
          >
            Hủy Check All
          </button>
        ) : (
          <button
            type="button"
            onClick={onCheckAll}
            disabled={
              loading ||
              accountCount === 0 ||
              checkingId !== null ||
              cronTestLoading
            }
            className="rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 px-4 py-2 text-sm font-semibold hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Check All
          </button>
        )}
        <button
          type="button"
          onClick={onTestCronJob}
          disabled={
            loading ||
            checkingId !== null ||
            isCheckingAll ||
            cronTestLoading
          }
          title="Gọi cùng job với cron hàng giờ (check all + auto-assign), chạy trong process API. Process scheduler riêng (`node scheduler.js`) xem log server."
          className="rounded-xl bg-amber-500/15 text-amber-200 border border-amber-400/35 px-4 py-2 text-sm font-semibold hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {cronTestLoading ? "Đang chạy job…" : "Test job cron"}
        </button>
      </div>
    </div>
  );
}
