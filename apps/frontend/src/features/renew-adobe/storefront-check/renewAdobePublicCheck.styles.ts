/** Giống `Website/my-store/.../CheckProfile/renewAdobe.styles.ts` — animation icon/check. */
export const RENEW_ADOBE_PUBLIC_CHECK_STYLES = `
  @keyframes anim-check-circle {
    0%        { transform: scale(0);    opacity: 0; }
    18%       { transform: scale(1.18); opacity: 1; }
    28%       { transform: scale(1);    opacity: 1; }
    72%       { transform: scale(1);    opacity: 1; }
    88%, 100% { transform: scale(0.7);  opacity: 0; }
  }
  @keyframes anim-check-path {
    0%,  22%  { stroke-dashoffset: 52; opacity: 0; }
    26%        { opacity: 1; }
    55%        { stroke-dashoffset: 0;  opacity: 1; }
    72%        { stroke-dashoffset: 0;  opacity: 1; }
    88%, 100%  { stroke-dashoffset: 52; opacity: 0; }
  }
  @keyframes anim-check-ring {
    0%        { transform: scale(0.6); opacity: 0; }
    18%       { transform: scale(1.35); opacity: 0.5; }
    35%       { transform: scale(1.6);  opacity: 0; }
    100%      { transform: scale(1.6);  opacity: 0; }
  }
  .anim-check-wrap {
    animation: anim-check-circle 2.8s cubic-bezier(0.34, 1.4, 0.64, 1) infinite;
  }
  .anim-check-svg-path {
    stroke-dasharray: 52;
    animation: anim-check-path 2.8s ease-in-out infinite;
  }
  .anim-check-ring {
    animation: anim-check-ring 2.8s ease-out infinite;
  }

  @keyframes renew-adobe-search-breathe {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.12); opacity: 0.92; }
  }
  .renew-adobe-search-titles {
    animation: renew-adobe-search-breathe 3.2s ease-in-out infinite;
    transform-origin: center;
  }

  @keyframes renew-adobe-search-btn-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }
  .renew-adobe-search-btn {
    animation: renew-adobe-search-btn-pulse 2.4s ease-in-out infinite;
    transform-origin: center;
  }

  @keyframes renew-adobe-refresh-nudge {
    0%, 100% { transform: rotate(0deg) scale(1); }
    40% { transform: rotate(-14deg) scale(1.04); }
    70% { transform: rotate(10deg) scale(1.04); }
  }
  .renew-adobe-refresh-nudge {
    animation: renew-adobe-refresh-nudge 3.2s ease-in-out infinite;
    transform-origin: center;
  }

  @keyframes renew-adobe-status-icon-bounce {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    35% { transform: translateY(-6px) rotate(-4deg); }
    70% { transform: translateY(-2px) rotate(4deg); }
  }
  .renew-adobe-status-icon-bounce {
    animation: renew-adobe-status-icon-bounce 2.6s ease-in-out infinite;
  }

  @keyframes renew-adobe-glow-pulse-rose {
    0%, 100% {
      box-shadow: 0 0 22px -4px rgba(244, 63, 94, 0.48), 0 0 0 0 rgba(244, 63, 94, 0);
    }
    50% {
      box-shadow: 0 0 34px -2px rgba(244, 63, 94, 0.62), 0 0 20px -8px rgba(244, 63, 94, 0.35);
    }
  }
  .renew-adobe-status-glow-rose {
    animation: renew-adobe-glow-pulse-rose 2.2s ease-in-out infinite;
  }

  @keyframes renew-adobe-glow-pulse-amber {
    0%, 100% {
      box-shadow: 0 0 22px -4px rgba(251, 191, 36, 0.42), 0 0 0 0 rgba(251, 191, 36, 0);
    }
    50% {
      box-shadow: 0 0 34px -2px rgba(251, 191, 36, 0.58), 0 0 20px -8px rgba(251, 191, 36, 0.3);
    }
  }
  .renew-adobe-status-glow-amber {
    animation: renew-adobe-glow-pulse-amber 2.2s ease-in-out infinite;
  }

  @keyframes renew-adobe-error-ring {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.06); opacity: 0.88; }
  }
  .renew-adobe-error-icon {
    animation: renew-adobe-error-ring 2s ease-in-out infinite;
    transform-origin: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .renew-adobe-search-titles,
    .renew-adobe-search-btn,
    .renew-adobe-refresh-nudge,
    .renew-adobe-status-icon-bounce,
    .renew-adobe-status-glow-rose,
    .renew-adobe-status-glow-amber,
    .renew-adobe-error-icon {
      animation: none !important;
    }
  }
`;
