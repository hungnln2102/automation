import { useEffect, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { createAdobeAdminAccount } from "../api/renewAdobeApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AddAdminAccountModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function AddAdminAccountModal({
  open,
  onClose,
  onCreated,
}: AddAdminAccountModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpSource, setOtpSource] = useState<"tinyhost" | "hdsd">("hdsd");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPassword("");
    setOtpSource("hdsd");
    setError(null);
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setError("Nhập email hợp lệ.");
      return;
    }
    if (!password.trim()) {
      setError("Nhập mật khẩu đăng nhập Adobe admin.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await createAdobeAdminAccount({
        email: em,
        password,
        otp_source: otpSource,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Không thêm được tài khoản.");
    } finally {
      setLoading(false);
    }
  };

  const selectClass =
    "w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 outline-none disabled:opacity-60";

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 outline-none";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-admin-title"
          className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="absolute right-4 top-4 z-10 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label="Đóng"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
          <form onSubmit={handleSubmit} className="space-y-4 p-6 pt-8">
            <div>
              <h2
                id="add-admin-title"
                className="text-lg font-semibold tracking-tight text-white"
              >
                Thêm tài khoản admin
              </h2>
              <p className="mt-1 text-xs text-white/50">
                Dự án Automation mới chỉ dùng các bảng trong schema
                system_automation. OTP lấy qua API, không dùng mail_backup.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="add-admin-email" className="text-xs font-medium text-white/60">
                Email admin
              </label>
              <input
                id="add-admin-email"
                type="email"
                autoComplete="username"
                className={inputClass}
                placeholder="admin@example.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="add-admin-password" className="text-xs font-medium text-white/60">
                Mật khẩu
              </label>
              <input
                id="add-admin-password"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                placeholder="********"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="add-admin-otp-source"
                className="text-xs font-medium text-white/60"
              >
                Nguồn OTP
              </label>
              <select
                id="add-admin-otp-source"
                className={selectClass}
                value={otpSource}
                onChange={(ev) =>
                  setOtpSource(ev.target.value as "tinyhost" | "hdsd")
                }
                disabled={loading}
              >
                <option value="hdsd">otp.hdsd.net API</option>
                <option value="tinyhost">TinyHost API</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-amber-400/90" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
