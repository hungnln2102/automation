import React from "react";

export const GRADIENT_BUTTON_BASE =
  "inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_18px_45px_-20px_rgba(99,102,241,0.9)] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40";

const DISABLED_CLASSES =
  "opacity-60 cursor-not-allowed shadow-none pointer-events-none";

export interface GradientButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ElementType;
}

const GradientButton = React.forwardRef<
  HTMLButtonElement,
  GradientButtonProps
>(({ icon: Icon, className = "", disabled, children, ...rest }, ref) => {
  return (
    <button
      ref={ref}
      className={`${GRADIENT_BUTTON_BASE} ${
        disabled ? DISABLED_CLASSES : "hover:-translate-y-0.5"
      } ${className}`}
      disabled={disabled}
      {...rest}
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span className="font-semibold">{children}</span>
    </button>
  );
});

GradientButton.displayName = "GradientButton";

export default GradientButton;
