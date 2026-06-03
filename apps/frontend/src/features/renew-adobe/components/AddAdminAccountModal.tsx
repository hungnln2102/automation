import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  createAdobeAdminAccount,
  createAdobeAdminAccountsBulk,
} from "../api/renewAdobeApi";
import { ADMIN_OTP_SOURCE_OPTIONS, isDongvanOtpSource, type RenewOtpSource } from "../otpSource";
import {
  buildDongvanOtpPayload,
  DongvanOtpFields,
  validateDongvanOtpFields,
} from "./DongvanOtpFields";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AddMode = "single" | "bulk";

export type AddAdminAccountModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function parseEmailList(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function AddAdminAccountModal({
  open,
  onClose,
  onCreated,
}: AddAdminAccountModalProps) {
  const [mode, setMode] = useState<AddMode>("single");
  const [email, setEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [password, setPassword] = useState("");
  const [otpSource, setOtpSource] = useState<RenewOtpSource>("imap");
  const [otpRefreshToken, setOtpRefreshToken] = useState("");
  const [otpClientId, setOtpClientId] = useState("");
  const [otpMailEmail, setOtpMailEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bulkEmailCount = useMemo(
    () => parseEmailList(bulkEmails).length,
    [bulkEmails]
  );

  useEffect(() => {
    if (!open) return;
    setMode("single");
    setEmail("");
    setBulkEmails("");
    setPassword("");
    setOtpSource("imap");
    setOtpRefreshToken("");
    setOtpClientId("");
    setOtpMailEmail("");
    setError(null);
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pw = password.trim();
    if (!pw) {
      setError("Nhập mật khẩu Adobe.");
      return;
    }

    const dongvanErr = validateDongvanOtpFields(otpSource, otpRefreshToken, otpClientId);
    if (dongvanErr) {
      setError(dongvanErr);
      return;
    }

    const backupMail = otpMailEmail.trim().toLowerCase();
    if (backupMail && !EMAIL_RE.test(backupMail)) {
      setError("Mail phụ backup (OTP) không hợp lệ.");
      return;
    }

    const dongvanPayload = buildDongvanOtpPayload(
      otpSource,
      otpRefreshToken,
      otpClientId,
      otpMailEmail,
    );
    const backupMailPayload =
      !isDongvanOtpSource(otpSource) && backupMail
        ? { otp_mail_email: backupMail }
        : {};

    if (mode === "single") {
      const em = email.trim().toLowerCase();
      if (!EMAIL_RE.test(em)) {
        setError("Nhập email hợp lệ.");
        return;
      }

      setLoading(true);
      try {
        await createAdobeAdminAccount({
          email: em,
          password: pw,
          otp_source: otpSource,
          ...dongvanPayload,
          ...backupMailPayload,
        });
        onCreated();
        onClose();
      } catch (err) {
        setError((err as Error)?.message ?? "Không thêm được tài khoản.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const emails = parseEmailList(bulkEmails);
    const invalid = emails.filter((item) => !EMAIL_RE.test(item));
    if (emails.length === 0) {
      setError("Nhập ít nhất một email.");
      return;
    }
    if (invalid.length > 0) {
      setError(`Email không hợp lệ: ${invalid.slice(0, 5).join(", ")}`);
      return;
    }

    setLoading(true);
    try {
      const result = await createAdobeAdminAccountsBulk({
        emails,
        password: pw,
        otp_source: otpSource,
        ...dongvanPayload,
        ...backupMailPayload,
      });
      if (result.created.length === 0) {
        setError(
          result.skipped.length > 0
            ? "Các email này đã có trong danh sách tài khoản admin."
            : "Không thêm được tài khoản nào."
        );
        return;
      }
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Không thêm được danh sách tài khoản.");
    } finally {
      setLoading(false);
    }
  };

  const selectClass =
    "w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 outline-none disabled:opacity-60";

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 outline-none";

  const modeButtonClass = (value: AddMode) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
      mode === value
        ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
        : "text-white/60 hover:bg-white/5 hover:text-white"
    }`;

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

            <div className="flex rounded-xl border border-white/10 bg-slate-950/40 p-1">
              <button
                type="button"
                className={modeButtonClass("single")}
                onClick={() => setMode("single")}
                disabled={loading}
              >
                Một email
              </button>
              <button
                type="button"
                className={modeButtonClass("bulk")}
                onClick={() => setMode("bulk")}
                disabled={loading}
              >
                Nhiều email
              </button>
            </div>

            {mode === "single" ? (
              <div className="space-y-1">
                <label
                  htmlFor="add-admin-email"
                  className="text-xs font-medium text-white/60"
                >
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
            ) : (
              <div className="space-y-1">
                <label
                  htmlFor="add-admin-emails"
                  className="text-xs font-medium text-white/60"
                >
                  Email admin
                </label>
                <textarea
                  id="add-admin-emails"
                  className={`${inputClass} min-h-36 resize-y leading-6`}
                  placeholder={"admin1@example.com\nadmin2@example.com"}
                  value={bulkEmails}
                  onChange={(ev) => setBulkEmails(ev.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-white/45">
                  Đã nhận diện {bulkEmailCount} email.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label
                htmlFor="add-admin-password"
                className="text-xs font-medium text-white/60"
              >
                Mật khẩu
              </label>
              <input
                id="add-admin-password"
                type="text"
                autoComplete="new-password"
                className={`${inputClass} font-mono`}
                placeholder="Nhập mật khẩu Adobe"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                disabled={loading}
                required
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
                onChange={(ev) => setOtpSource(ev.target.value as RenewOtpSource)}
                disabled={loading}
              >
                {ADMIN_OTP_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {!isDongvanOtpSource(otpSource) ? (
              <div className="space-y-1">
                <label
                  htmlFor="add-admin-otp-backup-mail"
                  className="text-xs font-medium text-white/60"
                >
                  Mail phụ backup (OTP)
                </label>
                <input
                  id="add-admin-otp-backup-mail"
                  type="email"
                  className={inputClass}
                  placeholder="Để trống = dùng email tài khoản admin"
                  value={otpMailEmail}
                  onChange={(ev) => setOtpMailEmail(ev.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-white/45">
                  Nếu điền, hệ thống lấy mã OTP từ mail này thay vì email đăng nhập Adobe.
                </p>
              </div>
            ) : null}

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
