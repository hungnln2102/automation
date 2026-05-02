type AnimatedCheckmarkProps = {
  size?: "default" | "compact";
};

export function AnimatedCheckmark({ size = "default" }: AnimatedCheckmarkProps) {
  const box = size === "compact" ? "h-12 w-12" : "h-16 w-16";
  const svgDim = size === "compact" ? 26 : 34;
  const stroke = size === "compact" ? 2.6 : 3.2;

  return (
    <div className={`relative flex ${box} items-center justify-center`}>
      <div className="anim-check-ring absolute inset-0 rounded-full border-2 border-emerald-400" />
      <div
        className={`anim-check-wrap flex ${box} items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40`}
      >
        <svg
          width={svgDim}
          height={svgDim}
          viewBox="0 0 34 34"
          fill="none"
          aria-hidden="true"
        >
          <polyline
            className="anim-check-svg-path"
            points="7,18 14,25 27,11"
            stroke="white"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
