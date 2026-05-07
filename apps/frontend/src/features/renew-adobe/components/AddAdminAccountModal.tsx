import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  createAdobeAdminAccount,
  createAdobeAdminAccountsBulk,
} from "../api/renewAdobeApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_ADOBE_ADMIN_PASSWORD = "Adobe123@";

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
  const [otpSource, setOtpSource] = useState<"tinyhost" | "hdsd">("hdsd");
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
    setOtpSource("hdsd");
    setError(null);
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
          otp_source: otpSource,
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
        otp_source: otpSource,
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
              <span className="text-xs font-medium text-white/60">
                Mật khẩu
              </span>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-100">
                {DEFAULT_ADOBE_ADMIN_PASSWORD}
              </div>
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
