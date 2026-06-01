import { useEffect, useRef, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { createRenewAdobeListUser } from "@/features/renew-adobe/user-orders/api";
import { WEB_OTP_SOURCE_OPTIONS, type RenewOtpSource } from "@/features/renew-adobe/otpSource";
import {
  buildDongvanOtpPayload,
  DongvanOtpFields,
  validateDongvanOtpFields,
} from "@/features/renew-adobe/components/DongvanOtpFields";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AddListUserModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function AddListUserModal({
  open,
  onClose,
  onCreated,
}: AddListUserModalProps) {
  const [customer, setCustomer] = useState("");
  const [account, setAccount] = useState("");
  const [expired, setExpired] = useState("");
  const [otpSource, setOtpSource] = useState<RenewOtpSource>("hdsd");
  const [otpRefreshToken, setOtpRefreshToken] = useState("");
  const [otpClientId, setOtpClientId] = useState("");
  const [otpMailEmail, setOtpMailEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setCustomer("");
    setAccount("");
    setExpired("");
    setOtpSource("hdsd");
    setOtpRefreshToken("");
    setOtpClientId("");
    setOtpMailEmail("");
    setError(null);
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;

    const em = account.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setError("Nhập email người dùng (Adobe) hợp lệ.");
      return;
    }

    const dongvanErr = validateDongvanOtpFields(otpSource, otpRefreshToken, otpClientId);
    if (dongvanErr) {
      setError(dongvanErr);
      return;
    }

    setError(null);
    submittingRef.current = true;
    setLoading(true);
    try {
      await createRenewAdobeListUser({
        customer: customer.trim() || null,
        account: em,
        expired: expired.trim() || null,
        otp_source: otpSource,
        ...buildDongvanOtpPayload(otpSource, otpRefreshToken, otpClientId, otpMailEmail),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Không lưu được vào list_user.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 outline-none";

  const selectClass =
    "w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 outline-none disabled:opacity-60";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-list-user-title"
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
                id="add-list-user-title"
                className="text-lg font-semibold tracking-tight text-white"
              >
                Thêm user vào danh sách
              </h2>
              <p className="mt-1 text-xs text-white/50">
                Chỉ lưu vào bảng{" "}
                <span className="font-mono text-white/70">system_automation.list_user</span>.
                Sau khi lưu, dùng <span className="text-white/80">Fix all</span> hoặc <span className="text-white/80">Fix</span> cho từng dòng{" "}
                <span className="font-mono text-white/65">Chưa add</span> để gán lên Adobe.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">
                Email người dùng <span className="text-rose-400">*</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                className={inputClass}
                placeholder="user@domain.com"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">
                Tên khách hàng
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="Tên hiển thị / công ty"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">
                Hạn sử dụng
              </label>
              <input
                type="date"
                className={inputClass}
                value={expired}
                onChange={(e) => setExpired(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="add-list-user-otp-source"
                className="mb-1 block text-xs font-medium text-white/60"
              >
                Nguồn OTP
              </label>
              <select
                id="add-list-user-otp-source"
                className={selectClass}
                value={otpSource}
                onChange={(ev) => setOtpSource(ev.target.value as RenewOtpSource)}
                disabled={loading}
              >
                {WEB_OTP_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-white/45">
                Dùng để lấy mã OTP Adobe qua web cho email người dùng này.
              </p>
            </div>

            {otpSource === "dongvan" ? (
              <DongvanOtpFields
                refreshToken={otpRefreshToken}
                clientId={otpClientId}
                onRefreshTokenChange={setOtpRefreshToken}
                onClientIdChange={setOtpClientId}
                onMailEmailChange={(value) => setOtpMailEmail(value ?? "")}
                disabled={loading}
                inputClass={inputClass}
              />
            ) : null}

            {error ? (
              <p className="text-sm text-rose-300" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-emerald-500/25 text-emerald-200 border border-emerald-400/45 px-4 py-2.5 text-sm font-semibold hover:bg-emerald-500/35 disabled:opacity-50 disabled:cursor-not-allowed"
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
