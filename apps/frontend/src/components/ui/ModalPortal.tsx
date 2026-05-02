import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * Render children tại document.body qua React Portal.
 * Giải quyết triệt để lỗi modal bị đè bởi stacking context
 * (do transition, transform, backdrop-blur, animate-in trên parent).
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}
