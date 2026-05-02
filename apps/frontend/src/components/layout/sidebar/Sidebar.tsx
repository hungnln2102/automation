import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "../../../AuthContext";
import SidebarAccount from "./SidebarAccount";
import ChangePasswordModal from "./ChangePasswordModal";
import { menuSections } from "./menuConfig";
import SidebarMenuSection from "./SidebarMenuSection";
import { matchesHref } from "./sidebarUtils";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const getActiveSectionId = (currentPath: string, currentSearch: string) =>
  menuSections.find((section) =>
    section.items.some(
      (item) =>
        currentPath === item.href ||
        matchesHref(currentPath, currentSearch, item.href)
    )
  )?.id ?? null;

const getDefaultOpenSectionId = () =>
  menuSections.find((section) => section.defaultOpen)?.id ?? null;

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const location = useLocation();
  const { user, setUser } = useAuth();
  const activeSectionId = getActiveSectionId(
    location.pathname,
    location.search
  );
  const [openSectionId, setOpenSectionId] = useState<string | null>(
    () =>
      (activeSectionId
        ? activeSectionId
        : getDefaultOpenSectionId()) ?? null
  );
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    if (!activeSectionId) {
      return;
    }

    setOpenSectionId(activeSectionId);
  }, [activeSectionId]);

  const toggleSection = (sectionId: string) => {
    setOpenSectionId((prev) => (prev === sectionId ? null : sectionId));
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      /* ignore */
    } finally {
      setUser(null);
      window.location.href = "/login";
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="sidebar__backdrop fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`sidebar fixed bottom-4 left-4 top-4 z-40 w-[calc(100vw-2rem)] max-w-[21rem] rounded-[32px] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] glass-panel transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isOpen
            ? "translate-x-0 opacity-100"
            : "-translate-x-[110%] opacity-0 lg:translate-x-0 lg:opacity-100"
        }`}
      >
        <div className="sidebar__inner flex h-full flex-col">
          <div className="sidebar__brand px-4 pt-4 pb-4">
            <div className="relative overflow-hidden rounded-[24px] border border-white/[0.72] p-[1px] shadow-[0_20px_42px_-28px_rgba(79,70,229,0.8)]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(99,102,241,0.24),rgba(14,20,36,0.3)_45%,rgba(168,85,247,0.2))]" />
              <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white/[0.08] to-transparent" />

              <div className="relative flex h-[5.1rem] items-center overflow-hidden rounded-[23px] border border-white/[0.06] bg-[#0c1222]/92 backdrop-blur-md [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
                <div
                  className="animate-marquee-seamless"
                  style={{ animationDuration: "18s" }}
                >
                  <div className="flex items-center gap-6 whitespace-nowrap px-4">
                    <span className="text-[2.15rem] font-black uppercase leading-none tracking-[0.04em] text-white">
                      Đạt Phần Mềm
                    </span>
                    <span className="text-[2.15rem] font-black uppercase leading-none tracking-[0.04em] text-indigo-200/55">
                      Đạt Phần Mềm
                    </span>
                  </div>
                  <div className="flex items-center gap-6 whitespace-nowrap px-4">
                    <span className="text-[2.15rem] font-black uppercase leading-none tracking-[0.04em] text-white">
                      Đạt Phần Mềm
                    </span>
                    <span className="text-[2.15rem] font-black uppercase leading-none tracking-[0.04em] text-indigo-200/55">
                      Đạt Phần Mềm
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <nav className="sidebar__nav flex-1 overflow-y-auto px-3 pb-5">
            <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,14,28,0.96),rgba(6,9,18,0.98))] p-2 shadow-[0_24px_52px_-30px_rgba(15,23,42,0.95)]">
              <div className="divide-y divide-white/[0.06]">
                {menuSections.map((section) => (
                  <SidebarMenuSection
                    key={section.id}
                    section={section}
                    isStaticSection={section.items.length === 1}
                    isOpenSection={openSectionId === section.id}
                    currentPath={location.pathname}
                    currentSearch={location.search}
                    onToggle={toggleSection}
                    onNavigate={() => setIsOpen(false)}
                  />
                ))}
              </div>
            </div>
          </nav>

          <SidebarAccount
            user={user}
            onLogout={handleLogout}
            onChangePassword={() => setShowChangePassword(true)}
          />
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </>
  );
}
