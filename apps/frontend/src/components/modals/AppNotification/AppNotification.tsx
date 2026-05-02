import React, { useEffect, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  APP_NOTIFICATION_EVENT,
  AppNotificationPayload,
} from "../../../lib/notifications";

const AppNotification: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [payload, setPayload] = useState<AppNotificationPayload | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<AppNotificationPayload>;
      setPayload(customEvent.detail);
      setIsOpen(true);
    };

    window.addEventListener(APP_NOTIFICATION_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(
        APP_NOTIFICATION_EVENT,
        handler as EventListener
      );
    };
  }, []);

  if (!isOpen || !payload) return null;

  const { title = "Thông báo", message, type = "info" } = payload;

  const colorClasses =
    type === "success"
      ? "from-emerald-600/90 via-emerald-700/90 to-emerald-900/95 border-emerald-300/40"
      : type === "error"
      ? "from-rose-600/90 via-rose-700/90 to-rose-900/95 border-rose-300/40"
      : "from-slate-800/95 via-indigo-900/95 to-slate-950/95 border-white/20";

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 transition-opacity duration-300">
      <div
        className={`w-full max-w-md mx-4 transform transition-all duration-300 rounded-2xl border ${colorClasses} p-6 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.9)] backdrop-blur-xl`}
      >
        <h3 className="text-lg font-semibold leading-6 text-white mb-3">
          {title}
        </h3>
        <p className="text-sm text-white/90 mb-6 whitespace-pre-line">
          {message}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/15 text-sm font-semibold text-white border border-white/30 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default AppNotification;

