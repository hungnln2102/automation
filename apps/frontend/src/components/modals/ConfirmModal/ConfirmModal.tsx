import React from "react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  secondaryMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  secondaryMessage,
  confirmLabel = "OK",
  cancelLabel = "Hủy",
  isSubmitting = false,
}) => {
  if (!isOpen) return null;

  // Portal + z-[10000]: layer cao nhất cho xác nhận (trên modal thường z-[9999])
  const overlay = (
    <div className="confirm-modal fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 transition-opacity duration-300">
      <div className="confirm-modal__container w-full max-w-md mx-4 transform transition-all duration-300 scale-100 rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900/90 via-indigo-900/85 to-slate-950/90 p-6 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.9)] backdrop-blur">
        <h3 className="confirm-modal__title text-lg font-semibold leading-6 text-white mb-2">
          {title}
        </h3>
        <div className="confirm-modal__body mb-4">
          <p className="confirm-modal__message text-sm text-white/90">{message}</p>
          {secondaryMessage ? (
            <p className="mt-2 text-sm font-semibold text-rose-300">
              {secondaryMessage}
            </p>
          ) : null}
        </div>
        <div className="confirm-modal__actions flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="confirm-modal__btn confirm-modal__btn--cancel px-4 py-2 rounded-md border border-white/20 bg-white/10 text-white hover:bg-white/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="confirm-modal__btn confirm-modal__btn--confirm px-4 py-2 rounded-md bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Đang Xử Lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
};

export default ConfirmModal;
