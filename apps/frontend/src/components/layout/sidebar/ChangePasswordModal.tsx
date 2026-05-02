import React, { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { apiFetch } from "../../../lib/api";

type ChangePasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const resetPasswordForm = () => {
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setPasswordError(null);
    setPasswordSuccess(null);
  };

  useEffect(() => {
    if (isOpen) {
      resetPasswordForm();
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
    resetPasswordForm();
  };

  const submitPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      setPasswordError("Vui lòng nhập đủ thông tin.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Mật khẩu mới không khớp.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          confirmPassword: passwordForm.confirmPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setPasswordError(data?.error || "Không thay đổi được mật khẩu.");
        return;
      }

      setPasswordSuccess("Thay đổi mật khẩu thành công.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch {
      setPasswordError("Không thay đổi được mật khẩu.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900/90 via-indigo-900/85 to-slate-950/90 p-6 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.9)] backdrop-blur"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Thay đổi mật khẩu</h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-white/70 hover:text-white transition rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
            aria-label="Đóng"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submitPasswordChange} className="space-y-4">
          <label className="block text-sm text-indigo-100">
            <span>Mật khẩu cũ</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  currentPassword: event.target.value,
                }))
              }
              placeholder="Nhập mật khẩu cũ"
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-indigo-200/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
            />
          </label>

          <label className="block text-sm text-indigo-100">
            <span>Mật khẩu mới</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  newPassword: event.target.value,
                }))
              }
              placeholder="Nhập mật khẩu mới"
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-indigo-200/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
            />
          </label>

          <label className="block text-sm text-indigo-100">
            <span>Nhập lại mật khẩu mới</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  confirmPassword: event.target.value,
                }))
              }
              placeholder="Nhập lại mật khẩu mới"
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-indigo-200/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
            />
          </label>

          {passwordError && (
            <p className="text-sm text-rose-300">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-emerald-200">{passwordSuccess}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isChangingPassword}
              className="px-4 py-2 rounded-md border border-white/20 bg-white/10 text-white hover:bg-white/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isChangingPassword}
              className="px-4 py-2 rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isChangingPassword ? "Đang xử lý..." : "Xác nhận"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
};

export default ChangePasswordModal;
