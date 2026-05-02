import React, { useMemo } from "react";

/**
 * LoginBackground Component
 * Renders the retro-futuristic background effects
 */
export const LoginBackground: React.FC = () => {
  const gradientId = useMemo(
    () => `retro-grid-${Math.random().toString(36).slice(2)}`,
    []
  );

  return (
    <>
      <svg width="0" height="0" className="sr-only" aria-hidden="true">
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff6ec7" />
          <stop offset="50%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#4de1ec" />
        </linearGradient>
      </svg>

      <div className="retro-bg" aria-hidden="true">
        <div className="retro-grid" />
        <div className="retro-sun" />
        <div className="retro-planet" />
        <div className="retro-glow" />
      </div>
    </>
  );
};
