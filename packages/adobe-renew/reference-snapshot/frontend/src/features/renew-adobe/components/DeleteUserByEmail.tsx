/**
 * Component: Xóa user trên Adobe Admin Console theo email.
 * Luồng: nhập email → tra cứu tài khoản (user_account_mapping hoặc email chủ admin) → login → Users → xóa + xác nhận.
 */

import { useState } from "react";
import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";

export type DeleteUserByEmailProps = {
  /** Gọi lại sau khi xóa thành công (vd. refresh danh sách account) */
  onDeleted?: () => void;
};

export function DeleteUserByEmail({ onDeleted }: DeleteUserByEmailProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDelete = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Nhập email user cần xóa.");
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);

    const params = new URLSearchParams({ email: trimmed });
    apiFetch(`${API_ENDPOINTS.RENEW_ADOBE_ACCOUNT_LOOKUP}?${params}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.account) {
          setError(data?.error ?? "Không tìm thấy tài khoản chứa user này (mapping / email admin).");
          setLoading(false);
          return;
        }
        const accountId = Number(data.account.id);
        if (!Number.isFinite(accountId)) {
          setError("Tài khoản không hợp lệ.");
          setLoading(false);
          return;
        }
        return apiFetch(
          API_ENDPOINTS.RENEW_ADOBE_ACCOUNT_AUTO_DELETE_USERS(accountId),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userEmails: [trimmed] }),
          }
        )
          .then((res) => res.json().then((payload) => ({ ok: res.ok, data: payload })))
          .then(({ ok: deleteOk, data }) => {
            const hasFailed = Array.isArray(data?.failed) && data.failed.length > 0;
            if (deleteOk && data.success && !hasFailed) {
              setSuccess(data.message ?? "Đã xóa user và cập nhật danh sách.");
              setEmail("");
              onDeleted?.();
            } else {
              setError(data?.failed?.[0]?.error ?? data?.message ?? data?.error ?? "Xóa user thất bại.");
            }
          });
      })
      .catch((err) => setError(err?.message ?? "Lỗi khi xóa user."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="rounded-[18px] bg-gradient-to-br from-slate-800/65 via-slate-700/55 to-slate-900/65 border border-white/15 p-4 lg:p-6 shadow-[0_20px_55px_-30px_rgba(0,0,0,0.7)] backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white/90 mb-1">Xóa người dùng trên Admin Console</h3>
      <p className="text-xs text-white/50 mb-3">
        Nhập email user cần xóa. Hệ thống tìm admin theo mapping (hoặc email chủ), đăng nhập, vào Users và xóa + xác nhận.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-white/60 mb-1.5">
            Email user cần xóa
          </label>
          <input
            type="text"
            placeholder="Nhập email"
            className="w-full px-4 py-2.5 border border-white/10 rounded-xl bg-slate-950/40 text-sm text-white placeholder:text-slate-400/70 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 outline-none"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleDelete()}
          />
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium px-5 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Đang xử lý..." : "Xóa người dùng"}
        </button>
      </div>
      {error && <p className="text-amber-400/90 text-sm mt-2">{error}</p>}
      {success && <p className="text-emerald-400/90 text-sm mt-2">{success}</p>}
    </div>
  );
}
