import React from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import type { MenuSection, MenuTone } from "./menuConfig";
import { matchesHref } from "./sidebarUtils";

type SidebarMenuSectionProps = {
  section: MenuSection;
  isStaticSection: boolean;
  isOpenSection: boolean;
  currentPath: string;
  currentSearch: string;
  onToggle: (sectionId: string) => void;
  onNavigate: () => void;
};

type SectionTheme = {
  iconBox: string;
  badge: string;
  rowGlow: string;
  dropdownShell: string;
  activeItem: string;
  activeDot: string;
  inactiveDot: string;
  rail: string;
};

const SECTION_THEME_MAP: Record<MenuTone, SectionTheme> = {
  indigo: {
    iconBox:
      "border-indigo-400/25 bg-indigo-500/[0.12] text-indigo-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    badge: "border-indigo-400/25 bg-indigo-500/[0.12] text-indigo-100/90",
    rowGlow: "bg-indigo-500/[0.05]",
    dropdownShell: "border-indigo-400/[0.16] bg-indigo-500/[0.04]",
    activeItem:
      "border-indigo-400/20 bg-indigo-500/[0.12] text-white shadow-[0_12px_24px_-20px_rgba(99,102,241,0.95)]",
    activeDot: "border-indigo-200/60 bg-indigo-300",
    inactiveDot: "border-white/[0.18] bg-[#09101e] group-hover:border-white/[0.35]",
    rail: "bg-gradient-to-b from-indigo-300/80 via-indigo-400/30 to-transparent",
  },
  sky: {
    iconBox:
      "border-sky-400/25 bg-sky-500/[0.12] text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    badge: "border-sky-400/25 bg-sky-500/[0.12] text-sky-100/90",
    rowGlow: "bg-sky-500/[0.05]",
    dropdownShell: "border-sky-400/[0.16] bg-sky-500/[0.04]",
    activeItem:
      "border-sky-400/20 bg-sky-500/[0.12] text-white shadow-[0_12px_24px_-20px_rgba(56,189,248,0.95)]",
    activeDot: "border-sky-200/60 bg-sky-300",
    inactiveDot: "border-white/[0.18] bg-[#09101e] group-hover:border-white/[0.35]",
    rail: "bg-gradient-to-b from-sky-300/80 via-sky-400/30 to-transparent",
  },
  emerald: {
    iconBox:
      "border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    badge: "border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-100/90",
    rowGlow: "bg-emerald-500/[0.05]",
    dropdownShell: "border-emerald-400/[0.16] bg-emerald-500/[0.04]",
    activeItem:
      "border-emerald-400/20 bg-emerald-500/[0.12] text-white shadow-[0_12px_24px_-20px_rgba(52,211,153,0.95)]",
    activeDot: "border-emerald-200/60 bg-emerald-300",
    inactiveDot: "border-white/[0.18] bg-[#09101e] group-hover:border-white/[0.35]",
    rail: "bg-gradient-to-b from-emerald-300/80 via-emerald-400/30 to-transparent",
  },
  rose: {
    iconBox:
      "border-rose-400/25 bg-rose-500/[0.12] text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    badge: "border-rose-400/25 bg-rose-500/[0.12] text-rose-100/90",
    rowGlow: "bg-rose-500/[0.05]",
    dropdownShell: "border-rose-400/[0.16] bg-rose-500/[0.04]",
    activeItem:
      "border-rose-400/20 bg-rose-500/[0.12] text-white shadow-[0_12px_24px_-20px_rgba(251,113,133,0.95)]",
    activeDot: "border-rose-200/60 bg-rose-300",
    inactiveDot: "border-white/[0.18] bg-[#09101e] group-hover:border-white/[0.35]",
    rail: "bg-gradient-to-b from-rose-300/80 via-rose-400/30 to-transparent",
  },
  amber: {
    iconBox:
      "border-amber-400/25 bg-amber-500/[0.12] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    badge: "border-amber-400/25 bg-amber-500/[0.12] text-amber-100/90",
    rowGlow: "bg-amber-500/[0.05]",
    dropdownShell: "border-amber-400/[0.16] bg-amber-500/[0.04]",
    activeItem:
      "border-amber-400/20 bg-amber-500/[0.12] text-white shadow-[0_12px_24px_-20px_rgba(251,191,36,0.95)]",
    activeDot: "border-amber-200/60 bg-amber-300",
    inactiveDot: "border-white/[0.18] bg-[#09101e] group-hover:border-white/[0.35]",
    rail: "bg-gradient-to-b from-amber-300/80 via-amber-400/30 to-transparent",
  },
};

const SidebarMenuSection: React.FC<SidebarMenuSectionProps> = ({
  section,
  isStaticSection,
  isOpenSection,
  currentPath,
  currentSearch,
  onToggle,
  onNavigate,
}) => {
  const theme = SECTION_THEME_MAP[section.tone];
  const SectionIcon = section.icon;
  const isItemActive = (href: string) => {
    const [itemPath] = href.split("?");
    const hasQueryVariantForPath = section.items.some(
      (item) => item.href.startsWith(`${itemPath}?`)
    );
    if (hasQueryVariantForPath || href.includes("?")) {
      return matchesHref(currentPath, currentSearch, href);
    }
    return currentPath === href || matchesHref(currentPath, currentSearch, href);
  };
  const isSectionActive = section.items.some((item) => isItemActive(item.href));
  const rowStateClass =
    isSectionActive || isOpenSection
      ? `${theme.rowGlow} shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`
      : "";

  if (isStaticSection) {
    const item = section.items[0];
    const isActive = isItemActive(item.href);

    return (
      <Link
        to={item.href}
        onClick={onNavigate}
        className={`group block rounded-[20px] px-2 py-2 transition-all duration-200 ${
          isActive ? rowStateClass : "hover:bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center gap-3 rounded-[18px] px-2.5 py-2">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              isActive
                ? theme.iconBox
                : "border-white/[0.08] bg-white/[0.04] text-slate-300 group-hover:text-white"
            }`}
          >
            <item.icon className="h-5 w-5" />
          </span>

          <span className="min-w-0 flex-1 text-[15px] font-semibold text-white">
            {item.name}
          </span>

          <span
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[11px] font-semibold ${
              isActive
                ? theme.badge
                : "border-white/[0.08] bg-white/[0.04] text-slate-300"
            }`}
          >
            1
          </span>
        </div>
      </Link>
    );
  }

  return (
    <div
      className={`rounded-[20px] px-2 py-2 transition-[background-color,box-shadow] duration-200 ${
        isSectionActive || isOpenSection ? rowStateClass : "hover:bg-white/[0.02]"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(section.id)}
        className="flex w-full items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition-colors"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${theme.iconBox}`}
        >
          <SectionIcon className="h-5 w-5" />
        </span>

        <span className="min-w-0 flex-1 pr-2 text-[15px] font-semibold leading-5 text-white">
          {section.title}
        </span>

        <span
          className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border px-2 text-[11px] font-semibold ${theme.badge}`}
        >
          {section.items.length}
        </span>

        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${
            isOpenSection ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isOpenSection
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-2.5 pb-1 pt-1.5">
            <div
              className={`relative overflow-hidden rounded-[18px] border px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_34px_-28px_rgba(15,23,42,0.95)] ${theme.dropdownShell}`}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/[0.04] to-transparent" />
              <div
                className={`pointer-events-none absolute bottom-4 left-[1.45rem] top-4 w-px rounded-full ${theme.rail}`}
              />
              <div className="relative space-y-1.5">
                {section.items.map((item) => {
                  const isActive = isItemActive(item.href);

                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={onNavigate}
                      className={`group flex items-start gap-3 rounded-[14px] border px-3 py-3 text-sm transition-all duration-200 ${
                        isActive
                          ? theme.activeItem
                          : "border-transparent text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border transition-all ${
                          isActive ? theme.activeDot : theme.inactiveDot
                        }`}
                      />
                      <span className="min-w-0 flex-1 whitespace-normal font-medium leading-5">
                        {item.name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SidebarMenuSection;
