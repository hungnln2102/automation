type PublicEmailFieldProps = {
  accent: "purple" | "sky";
  value: string;
  onChange: (value: string) => void;
  variant?: "default" | "glass";
  compact?: boolean;
  disabled?: boolean;
};

export function PublicEmailField({
  accent,
  value,
  onChange,
  variant = "default",
  compact = false,
  disabled = false,
}: PublicEmailFieldProps) {
  const defaultClass = compact
    ? "h-10 w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 text-xs text-slate-100 placeholder-slate-500 outline-none ring-1 ring-transparent transition-all disabled:opacity-60"
    : "h-11 w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 text-sm text-slate-100 placeholder-slate-500 outline-none ring-1 ring-transparent transition-all disabled:opacity-60";
  const glassClass = compact
    ? "h-10 w-full rounded-xl border border-white/15 bg-slate-900/55 px-3 text-xs text-slate-100 placeholder-slate-500 outline-none transition-all backdrop-blur-md shadow-inner disabled:opacity-60"
    : "h-11 w-full rounded-xl border border-white/15 bg-slate-900/55 px-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all backdrop-blur-md shadow-inner disabled:opacity-60";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <label
        className={`font-semibold uppercase tracking-wide text-slate-400 ${
          compact ? "text-[10px]" : "text-xs"
        }`}
      >
        Email Adobe
      </label>
      <input
        type="email"
        autoComplete="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="your-email@mkvest.com"
        disabled={disabled}
        className={`${variant === "glass" ? glassClass : defaultClass} ${
          accent === "purple"
            ? "focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/30"
            : "focus:border-white/40 focus:ring-2 focus:ring-white/10"
        }`}
      />
    </div>
  );
}
