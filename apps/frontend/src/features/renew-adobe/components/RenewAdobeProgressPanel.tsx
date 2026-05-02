export type RenewAdobeProgressPanelProps = {
  total: number;
  completed: number;
  failed: number;
  isCheckingAll: boolean;
  autoAssignPhase: "idle" | "running" | "done";
  autoAssignResult: { assigned: number; skipped: number } | null;
  onClose: () => void;
};

export function RenewAdobeProgressPanel({
  total,
  completed,
  failed,
  isCheckingAll,
  autoAssignPhase,
  autoAssignResult,
  onClose,
}: RenewAdobeProgressPanelProps) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-slate-800/70 to-slate-900/70 border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/80 font-medium">
          {isCheckingAll
            ? "Đang check..."
            : autoAssignPhase === "running"
              ? "Đang phân bổ user..."
              : "Hoàn tất"}{" "}
          <span className="text-indigo-300 tabular-nums">
            {completed}/{total}
          </span>
          {failed > 0 && (
            <span className="text-rose-400 ml-2">({failed} lỗi)</span>
          )}
          {autoAssignPhase === "done" && autoAssignResult && (
            <span className="text-emerald-400 ml-2">
              — Đã gán {autoAssignResult.assigned} user
              {autoAssignResult.skipped > 0 &&
                `, ${autoAssignResult.skipped} bỏ qua (hết slot)`}
            </span>
          )}
        </span>
        {!isCheckingAll && autoAssignPhase !== "running" && (
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white/70 text-xs transition-colors"
          >
            Đóng
          </button>
        )}
      </div>
      <div className="h-2 rounded-full bg-slate-700/80 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            autoAssignPhase === "running"
              ? "bg-gradient-to-r from-violet-500 to-fuchsia-400 animate-pulse"
              : failed > 0 && !isCheckingAll
                ? "bg-gradient-to-r from-indigo-500 to-amber-500"
                : isCheckingAll
                  ? "bg-gradient-to-r from-indigo-500 to-cyan-400"
                  : "bg-gradient-to-r from-emerald-500 to-cyan-400"
          }`}
          style={{
            width:
              autoAssignPhase === "running"
                ? "100%"
                : `${Math.round((completed / total) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
