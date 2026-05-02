import { useEffect, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  createAdobeAdminAccount,
  createRenewAdobeMailBackupMailbox,
  fetchRenewAdobeMailBackupMailboxes,
  type MailBackupMailboxOption,
} from "../api/renewAdobeApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatMailboxOptionLine(m: MailBackupMailboxOption): string {
  const ap = m.alias_prefix?.trim();
  if (ap) return `${ap} — ${m.email}`;
  return m.email + (m.note ? ` — ${m.note}` : "");
}

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
  const [otpSource, setOtpSource] = useState<"imap" | "tinyhost" | "hdsd">(
    "imap"
  );
  const [mailBackupId, setMailBackupId] = useState("");
  const [newAliasPrefix, setNewAliasPrefix] = useState("");
  const [mailboxes, setMailboxes] = useState<MailBackupMailboxOption[]>([]);
  const [mbLoading, setMbLoading] = useState(false);
  const [mbLoadError, setMbLoadError] = useState<string | null>(null);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPassword("");
    setOtpSource("imap");
    setMailBackupId("");
    setNewAliasPrefix("");
    setError(null);
    setQuickAddError(null);
    setLoading(false);
    setMbLoadError(null);
    setMailboxes([]);
    setMbLoading(true);
    fetchRenewAdobeMailBackupMailboxes({ excludeAssigned: true })
      .then(setMailboxes)
      .catch((err) =>
        setMbLoadError((err as Error)?.message ?? "Không tải danh sách mail.")
      )
      .finally(() => setMbLoading(false));
  }, [open]);

  if (!open) return null;

  const handleQuickAddMailbox = async () => {
    const ap = newAliasPrefix.trim();
    if (!ap) {
      setQuickAddError("Nhập alias_prefix (vd. kelvindevil210299+accX).");
      return;
    }
    setQuickAddError(null);
    setQuickAddLoading(true);
    try {
      const created = await createRenewAdobeMailBackupMailbox({
        alias_prefix: ap,
      });
      const list = await fetchRenewAdobeMailBackupMailboxes({
        excludeAssigned: true,
      });
      setMailboxes(list);
      setMailBackupId(String(created.id));
      setNewAliasPrefix("");
    } catch (err) {
      setQuickAddError((err as Error)?.message ?? "Không tạo được hộp thư.");
    } finally {
      setQuickAddLoading(false);
    }
  };

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
    if (otpSource === "imap" && !mailBackupId) {
      setError("Nguồn IMAP bắt buộc phải chọn Alias (mail dự phòng).");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const mbParsed = mailBackupId ? parseInt(mailBackupId, 10) : NaN;
      await createAdobeAdminAccount({
        email: em,
        password,
        otp_source: otpSource,
        mail_backup_id:
          otpSource === "imap" && Number.isFinite(mbParsed) && mbParsed > 0
            ? mbParsed
            : null,
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-admin-title"
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50 z-10"
          aria-label="Đóng"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
        <form onSubmit={handleSubmit} className="p-6 pt-8 space-y-4">
          <div>
            <h2
              id="add-admin-title"
              className="text-lg font-semibold text-white tracking-tight"
            >
              Thêm tài khoản admin
            </h2>
            <p className="mt-1 text-xs text-white/50">
              Mail dự phòng gắn với cột <span className="text-white/70">alias_prefix</span>{" "}
              trong <span className="text-white/70">mail_backup</span> (lọc OTP). Thêm
              mới chỉ cần nhập <span className="text-white/70">alias_prefix</span>; email,
              app password và các trường khác tự lấy theo một dòng mẫu đang có.
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
              placeholder="••••••••"
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
                setOtpSource(ev.target.value as "imap" | "tinyhost" | "hdsd")
              }
              disabled={loading}
            >
              <option value="imap">IMAP (mail_backup/alias)</option>
              <option value="tinyhost">TinyHost API</option>
              <option value="hdsd">otp.hdsd.net API</option>
            </select>
          </div>

          {otpSource === "imap" && (
            <>
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3 space-y-2">
                <p className="text-xs font-medium text-emerald-200/90">
                  Thêm Alias IMAP (chỉ alias_prefix)
                </p>
                <p className="text-[11px] text-white/45 leading-relaxed">
                  Nguồn IMAP bắt buộc phải chọn Alias. Nếu chưa có, tạo nhanh bằng
                  <code className="text-white/55"> alias_prefix</code> ở đây.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    className={`${inputClass} flex-1`}
                    placeholder="vd. kelvindevil210299+acc4"
                    value={newAliasPrefix}
                    onChange={(ev) => {
                      setNewAliasPrefix(ev.target.value);
                      setQuickAddError(null);
                    }}
                    disabled={loading || quickAddLoading || mbLoading}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddMailbox}
                    disabled={
                      loading ||
                      quickAddLoading ||
                      mbLoading ||
                      !newAliasPrefix.trim()
                    }
                    className="rounded-xl bg-emerald-500/25 text-emerald-200 border border-emerald-400/35 px-4 py-2.5 text-sm font-semibold hover:bg-emerald-500/35 disabled:opacity-50 whitespace-nowrap"
                  >
                    {quickAddLoading ? "Đang tạo…" : "Tạo & chọn"}
                  </button>
                </div>
                {quickAddError && (
                  <p className="text-xs text-amber-400/90">{quickAddError}</p>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="add-admin-mail-backup"
                  className="text-xs font-medium text-white/60"
                >
                  Alias IMAP (mail dự phòng)
                </label>
                {mbLoading ? (
                  <p className="text-xs text-white/45 py-2">
                    Đang tải danh sách hộp thư…
                  </p>
                ) : mbLoadError ? (
                  <p className="text-xs text-amber-400/90 py-1">{mbLoadError}</p>
                ) : mailboxes.length === 0 ? (
                  <p className="text-xs text-white/45 py-1">
                    Chưa có Alias IMAP khả dụng. Hãy tạo mới bằng ô phía trên.
                  </p>
                ) : (
                  <select
                    id="add-admin-mail-backup"
                    className={selectClass}
                    value={mailBackupId}
                    onChange={(ev) => setMailBackupId(ev.target.value)}
                    disabled={loading}
                    required={otpSource === "imap" && mailboxes.length > 0}
                  >
                    <option value="">— Chọn Alias IMAP —</option>
                    {mailboxes.map((m) => (
                      <option key={m.id} value={String(m.id)}>
                        {formatMailboxOptionLine(m)}
                      </option>
                    ))}
                  </select>
                )}
                {!mbLoading && !mbLoadError && mailboxes.length > 0 && (
                  <p className="text-[11px] text-white/40">
                    Hiển thị theo cột alias_prefix trong database; email IMAP
                    thường giống dòng mẫu.
                  </p>
                )}
              </div>
            </>
          )}
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
              disabled={loading || mbLoading}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
}
