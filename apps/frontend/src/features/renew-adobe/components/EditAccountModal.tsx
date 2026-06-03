import { useState } from "react";
import type { AdobeAdminAccount } from "../types";
import { updateAdobeAccount } from "../api/renewAdobeApi";
import { ADMIN_OTP_SOURCE_OPTIONS, isDongvanOtpSource, type RenewOtpSource } from "../otpSource";
import {
  DongvanOtpFields,
  validateDongvanOtpFields,
} from "./DongvanOtpFields";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EditAccountModalProps = {
  account: AdobeAdminAccount;
  onClose: () => void;
  onSaved: () => void;
};

export function EditAccountModal({ account, onClose, onSaved }: EditAccountModalProps) {
  const [email, setEmail] = useState(account.email);
  const [password, setPassword] = useState(account.password_encrypted);
  const [orgName, setOrgName] = useState(account.org_name ?? "");
  const [otpSource, setOtpSource] = useState<RenewOtpSource>(
    (account.otp_source ?? "imap") as RenewOtpSource,
  );
  const [otpRefreshToken, setOtpRefreshToken] = useState(account.otp_refresh_token ?? "");
  const [otpClientId, setOtpClientId] = useState(account.otp_client_id ?? "");
  const [otpMailEmail, setOtpMailEmail] = useState(account.otp_mail_email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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

    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (email.trim() !== account.email) payload.email = email.trim();
      if (password !== account.password_encrypted) payload.password_encrypted = password;
      if (orgName.trim() !== (account.org_name ?? "")) payload.org_name = orgName.trim();
      if ((account.otp_source ?? "imap") !== otpSource) payload.otp_source = otpSource;
      if ((account.otp_refresh_token ?? "") !== otpRefreshToken.trim()) {
        payload.otp_refresh_token = otpRefreshToken.trim();
      }
      if ((account.otp_client_id ?? "") !== otpClientId.trim()) {
        payload.otp_client_id = otpClientId.trim();
      }
      if ((account.otp_mail_email ?? "") !== backupMail) {
        payload.otp_mail_email = backupMail;
      }

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      await updateAdobeAccount(account.id, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-4">
          Sửa tài khoản
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Mật khẩu</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-indigo-500/50 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Nguồn OTP
            </label>
            <select
              value={otpSource}
              onChange={(e) => setOtpSource(e.target.value as RenewOtpSource)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
            >
              <option value="imap">IMAP (mail_backup/alias)</option>
              {ADMIN_OTP_SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {!isDongvanOtpSource(otpSource) ? (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Mail phụ backup (OTP)
              </label>
              <input
                type="email"
                value={otpMailEmail}
                onChange={(e) => setOtpMailEmail(e.target.value)}
                placeholder="Để trống = dùng email tài khoản admin"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">
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
              disabled={saving}
              inputClass="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-indigo-500/50 outline-none"
            />
          ) : null}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Org Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
