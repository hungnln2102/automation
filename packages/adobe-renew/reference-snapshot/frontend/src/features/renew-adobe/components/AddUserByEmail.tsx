/**
 * Component: Thêm user trên Adobe Admin Console.
 * Chỉ cần nhập email → hệ thống tự phân bổ vào tài khoản còn gói & còn slot.
 */

import { useMemo, useState } from "react";
import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";

export type AddUserByEmailProps = {
  onAdded?: () => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const uniq = [...new Set(parts)];
  return uniq.filter((e) => EMAIL_RE.test(e));
}

export function AddUserByEmail({ onAdded }: AddUserByEmailProps) {
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastDistribution, setLastDistribution] = useState<
    {
      accountId: number;
      accountEmail: string;
      added: string[];
      user_count_after?: number;
      members_after?: number;
      error?: string;
    }[]
  >([]);
  const [lastExceeded, setLastExceeded] = useState<string[] | null>(null);

  const emails = useMemo(() => parseEmails(emailInput), [emailInput]);

  const handleAdd = async () => {
    if (emails.length === 0) {
      setError("Nhập ít nhất một email hợp lệ (mỗi dòng một email hoặc cách nhau bằng dấu phẩy).");
      return;
    }
    setError(null);
    setSuccess(null);
    setLastDistribution([]);
    setLastExceeded(null);
    setLoading(true);

    try {
      const res = await apiFetch(API_ENDPOINTS.RENEW_ADOBE_ACCOUNTS_ADD_USERS_BATCH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmails: emails }),
      });
      const data = await res.json();
      setLoading(false);
      if (res.ok && data.success) {
        setSuccess(data.message ?? "Đã thêm user.");
        setLastDistribution(data.distribution ?? []);
        setLastExceeded(data.exceeded_emails ?? null);
        if (data.total_added === emails.length && !data.exceeded_emails?.length) {
          setEmailInput("");
        }
        onAdded?.();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(data?.error ?? data?.message ?? "Thêm người dùng thất bại.");
        if (data?.distribution) setLastDistribution(data.distribution);
        if (data?.exceeded_emails) setLastExceeded(data.exceeded_emails);
      }
    } catch (err) {
      setLoading(false);
      setError((err as Error)?.message ?? "Lỗi kết nối.");
    }
  };

  return (
    <div className="rounded-[18px] bg-gradient-to-br from-slate-800/65 via-slate-700/55 to-slate-900/65 border border-white/15 p-4 lg:p-6 shadow-[0_20px_55px_-30px_rgba(0,0,0,0.7)] backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white/90 mb-1">Thêm người dùng</h3>
      <p className="text-xs text-white/50 mb-3">
        Nhập email cần thêm. Hệ thống tự phân bổ vào tài khoản còn gói & còn slot (tối đa 10 user/tài khoản).
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-medium text-white/60 mb-1.5">Email user cần thêm</label>
          <textarea
            rows={4}
            placeholder={"user1@example.com\nuser2@example.com\nhoặc user1@x.com, user2@x.com"}
            className="w-full px-4 py-2.5 border border-white/10 rounded-xl bg-slate-950/40 text-sm text-white placeholder:text-slate-400/70 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400 outline-none resize-y min-h-[100px]"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            disabled={loading}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading || emails.length === 0}
            className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-5 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Đang xử lý..." : `Thêm ${emails.length} người dùng`}
          </button>
          {emails.length > 0 && !loading && (
            <span className="text-xs text-white/50">{emails.length} email hợp lệ</span>
          )}
        </div>
      </div>

      {lastDistribution.length > 0 && (
        <div className="mt-3 text-xs text-white/70 space-y-1">
          {lastDistribution.map((d) =>
            d.error ? (
              <p key={d.accountId} className="text-amber-400/90">
                {d.accountEmail}: lỗi — {d.error}
              </p>
            ) : (
              <p key={d.accountId} className="text-emerald-400/90">
                {d.accountEmail}: đã thêm {d.added?.length ?? 0} user
                {d.members_after != null && d.user_count_after != null
                  ? ` (team: ${d.members_after}/${d.user_count_after} slot)`
                  : d.user_count_after != null
                    ? ` (slot gói: ${d.user_count_after})`
                    : ""}
                .
              </p>
            )
          )}
        </div>
      )}
      {lastExceeded && lastExceeded.length > 0 && (
        <p className="text-amber-400/90 text-xs mt-2">
          Còn {lastExceeded.length} email chưa thêm (hết slot): {lastExceeded.slice(0, 5).join(", ")}
          {lastExceeded.length > 5 ? "…" : ""}
        </p>
      )}
      {error && <p className="text-amber-400/90 text-sm mt-2">{error}</p>}
      {success && <p className="text-emerald-400/90 text-sm mt-2">{success}</p>}
    </div>
  );
}
