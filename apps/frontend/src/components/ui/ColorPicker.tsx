import React from "react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

const PRESET_COLORS = [
  "#facc15", // Yellow
  "#f97316", // Orange
  "#ef4444", // Red
  "#f43f5e", // Pink
  "#a855f7", // Purple
  "#8b5cf6", // Violet
  "#3b82f6", // Blue
  "#38bdf8", // Sky
  "#14b8a6", // Teal
  "#22c55e", // Green
  "#84cc16", // Lime
  "#eab308", // Amber
];

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label }) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
          {label}
        </label>
      )}
      
      {/* Preset Colors */}
      <div className="grid grid-cols-6 gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`h-10 w-full rounded-lg border-2 transition-all ${
              value === color
                ? "border-white ring-2 ring-white/50 scale-110"
                : "border-white/20 hover:border-white/40 hover:scale-105"
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Custom Color Input */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#facc15"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-16 rounded-lg border border-white/20 bg-slate-950/40 cursor-pointer"
        />
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
        />
      </div>
    </div>
  );
};

export default ColorPicker;
