import React from "react";

type GlowVariant =
  | "neutral"
  | "sky"
  | "violet"
  | "emerald"
  | "amber"
  | "rose";

interface GlassPanelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  glow?: GlowVariant;
}

const GLOW_MAP: Record<GlowVariant, string> = {
  neutral: "from-white/70 via-slate-100/40 to-transparent",
  sky: "from-sky-100/70 via-white/60 to-transparent",
  violet: "from-violet-100/70 via-white/60 to-transparent",
  emerald: "from-emerald-100/70 via-white/60 to-transparent",
  amber: "from-amber-100/70 via-white/60 to-transparent",
  rose: "from-rose-100/70 via-white/60 to-transparent",
};

const baseClass =
  "relative isolate overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_35px_95px_-60px_rgba(15,23,42,0.65)] backdrop-blur";

const GlassPanel: React.FC<GlassPanelProps> = ({
  glow = "neutral",
  className = "",
  children,
  ...rest
}) => {
  const glowClass = GLOW_MAP[glow] ?? GLOW_MAP.neutral;
  return (
    <div className={`${baseClass} ${className}`} {...rest}>
      <div
        className={`pointer-events-none absolute -inset-24 bg-gradient-to-br ${glowClass} opacity-80 blur-3xl`}
      />
      <div className="relative">{children}</div>
    </div>
  );
};

export default GlassPanel;
