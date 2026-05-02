import { useState } from "react";
import {
  ArrowRightOnRectangleIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/outline";

type SidebarUser = {
  username?: string | null;
  role?: string | null;
} | null;

type SidebarAccountProps = {
  user: SidebarUser;
  onLogout: () => void;
  onChangePassword: () => void;
};

const accountMenuItems = [
  "Thông tin",
  "Thông tin admin",
  "Thông tin quản lý",
  "Thay đổi mật khẩu",
];

const SidebarAccount: React.FC<SidebarAccountProps> = ({
  user,
  onLogout,
  onChangePassword,
}) => {
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const username = user?.username || "Tài khoản";
  const role = user?.role || "Chưa đăng nhập";

  return (
    <div className="relative mt-auto border-t border-white/5 bg-gradient-to-t from-white/[0.05] to-transparent px-4 pb-4 pt-3 rounded-b-[32px]">
      <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_18px_32px_-24px_rgba(15,23,42,0.9)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAccountMenu((prev) => !prev)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/20 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.35),transparent_60%),rgba(15,23,42,0.92)] text-white shadow-[0_16px_32px_-18px_rgba(99,102,241,0.9)]">
              <span className="text-base font-black tracking-tight">
                {username.slice(0, 1).toUpperCase()}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {username}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-100">
                  {role}
                </span>
              </div>
            </div>

            <ChevronUpDownIcon className="h-5 w-5 shrink-0 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
            title="Đăng xuất"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showAccountMenu && (
        <div className="glass-panel absolute bottom-[calc(100%+10px)] left-4 right-4 z-50 overflow-hidden rounded-[24px] border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <ul className="divide-y divide-white/5 py-2 text-[13px] font-medium text-indigo-100/90">
            {accountMenuItems.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04] hover:text-white"
                  onClick={() => {
                    setShowAccountMenu(false);
                    if (index === accountMenuItems.length - 1) {
                      onChangePassword();
                    }
                  }}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SidebarAccount;
