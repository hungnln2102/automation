import React from "react";

export interface StatAccent {
  border: string;
  glow: string;
  iconBg: string;
  activeBorder: string;
  activeGlow: string;
  activeShadow: string;
  activeBackground: string;
}

export const STAT_CARD_ACCENTS = {
  sky: {
    border: "border-sky-500/30",
    glow: "bg-sky-500/20",
    iconBg: "bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.5)]",
    activeBorder: "border-sky-300/25",
    activeGlow: "bg-sky-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(14,165,233,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
  emerald: {
    border: "border-emerald-500/30",
    glow: "bg-emerald-500/20",
    iconBg: "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]",
    activeBorder: "border-emerald-300/25",
    activeGlow: "bg-emerald-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(16,185,129,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
  violet: {
    border: "border-violet-500/30",
    glow: "bg-violet-500/20",
    iconBg: "bg-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]",
    activeBorder: "border-violet-300/25",
    activeGlow: "bg-violet-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(139,92,246,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
  amber: {
    border: "border-amber-500/30",
    glow: "bg-amber-500/20",
    iconBg: "bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)]",
    activeBorder: "border-amber-300/25",
    activeGlow: "bg-amber-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(245,158,11,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
  rose: {
    border: "border-rose-500/30",
    glow: "bg-rose-500/20",
    iconBg: "bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)]",
    activeBorder: "border-rose-300/25",
    activeGlow: "bg-rose-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(244,63,94,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
  indigo: {
    border: "border-indigo-500/30",
    glow: "bg-indigo-500/20",
    iconBg: "bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]",
    activeBorder: "border-indigo-300/25",
    activeGlow: "bg-indigo-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(99,102,241,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
  slate: {
    border: "border-slate-500/30",
    glow: "bg-slate-500/20",
    iconBg: "bg-slate-500 text-white shadow-[0_0_15px_rgba(100,116,139,0.5)]",
    activeBorder: "border-slate-300/25",
    activeGlow: "bg-slate-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(100,116,139,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
  teal: {
    border: "border-teal-500/30",
    glow: "bg-teal-500/20",
    iconBg: "bg-teal-500 text-white shadow-[0_0_15px_rgba(20,184,166,0.5)]",
    activeBorder: "border-teal-300/25",
    activeGlow: "bg-teal-400/25",
    activeShadow: "shadow-[0_14px_34px_-20px_rgba(20,184,166,0.65)]",
    activeBackground:
      "bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.22),transparent_42%),linear-gradient(160deg,rgba(30,41,59,0.84),rgba(15,23,42,0.9))]",
  },
} as const;

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  accent: StatAccent;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  iconClassName?: string;
  isActive?: boolean;
  onClick?: () => void;
  /** Kiểu hiển thị dành cho dashboard tổng quan: bố cục và typographic rõ hơn */
  variant?: "default" | "premium";
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  accent,
  subtitle,
  children,
  isActive,
  onClick,
  variant = "default",
}) => {
  const isInteractive = typeof onClick === "function";
  const isPremium = variant === "premium";
  const panelClass = isActive
    ? "backdrop-blur-[16px]"
    : "glass-panel";
  const hoverEffectClass =
    isInteractive && !isActive ? "holographic-hover" : "";
  const containerStateClass = isActive
    ? `${accent.activeBorder} ${accent.activeBackground} ${accent.activeShadow} scale-[1.02]`
    : `${accent.border} ${isInteractive ? "hover:scale-[1.02] cursor-pointer" : ""}`;
  const glowStateClass = isActive
    ? `${accent.activeGlow} opacity-30`
    : `${accent.glow} ${isPremium ? "opacity-15 group-hover:opacity-28" : "opacity-10 group-hover:opacity-25"} transition-opacity`;
  const Component = isInteractive ? "button" : "div";

  const radiusClass = isPremium ? "rounded-[26px] sm:rounded-[28px]" : "rounded-[24px]";
  const padClass = isPremium ? "p-5 sm:p-6" : "p-4 sm:p-5";
  const ringClass = isPremium ? "ring-1 ring-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" : "";

  return (
    <Component
      {...(isInteractive ? { type: "button", onClick } : {})}
      className={`stat-card group relative isolate overflow-hidden ${radiusClass} ${padClass} transition-all duration-300 z-10 ${ringClass} ${hoverEffectClass} ${panelClass} ${containerStateClass} ${
        isInteractive ? "w-full text-left" : ""
      }`}
    >
      <div className={`stat-card__glow absolute -right-14 -top-14 h-36 w-36 rounded-full blur-[68px] ${glowStateClass}`}></div>

      <div className={`stat-card__content flex items-start justify-between gap-4 ${isPremium ? "gap-5" : ""}`}>
        <div className="stat-card__text relative z-10 min-w-0 flex-1">
          <p
            className={`stat-card__title font-bold uppercase text-indigo-200/70 leading-tight ${
              isPremium
                ? "text-[11px] tracking-[0.22em] mb-2.5"
                : "text-[10px] sm:text-[11px] tracking-[0.2em] text-indigo-300/80 mb-1.5"
            }`}
          >
            {title}
          </p>
          <div className="flex flex-col gap-1">
            <h3
              className={`stat-card__value text-white tracking-tight text-balance ${
                isPremium
                  ? "text-[1.35rem] sm:text-[1.7rem] font-semibold tabular-nums [font-feature-settings:'tnum']"
                  : "text-xl sm:text-2xl font-bold leading-none"
              }`}
            >
              {value}
            </h3>
            {subtitle && (
              <p className="text-[10px] sm:text-xs font-medium text-emerald-400/80 tracking-wide">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div
          className={`stat-card__icon relative shrink-0 items-center justify-center border border-white/10 overflow-hidden transform transition-all duration-500 group-hover:rotate-[8deg] group-hover:scale-105 ${accent.iconBg} ${
            isPremium
              ? "flex h-12 w-12 rounded-2xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]"
              : "flex h-11 w-11 rounded-xl group-hover:rotate-[10deg] group-hover:scale-110"
          }`}
        >
          {/* Internal reflection */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-white/5 to-transparent pointer-events-none"></div>
          <Icon className={`relative z-10 ${isPremium ? "h-5 w-5 sm:h-6 sm:w-6" : "h-5 w-5"}`} />
        </div>
      </div>

      {children && (
        <div
          className={`relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-700 ${
            isPremium
              ? "mt-5 border-t border-white/[0.08] pt-4"
              : "mt-6"
          }`}
        >
          {children}
        </div>
      )}
    </Component>
  );
};

export default StatCard;
