import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const PageLoader = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
  </div>
);

const RenewAdobeAdminPage = lazy(() => import("@/features/renew-adobe/pages/RenewAdobeAdminPage"));
const MailBackupPage = lazy(() => import("@/features/renew-adobe/pages/MailBackupPage"));
const ProxyPoolPage = lazy(() => import("@/features/renew-adobe/pages/ProxyPoolPage"));
const RenewOrdersDeskPage = lazy(() => import("@/features/renew-adobe/desk/RenewOrdersDeskPage"));
const RenewAdobePublicCheckPage = lazy(
  () => import("@/features/renew-adobe/storefront-check/RenewAdobePublicCheckPage"),
);

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/renew-adobe-admin" replace />} />
        <Route path="/dashboard" element={<Navigate to="/renew-adobe-admin" replace />} />
        <Route path="/renew-adobe-admin" element={<RenewAdobeAdminPage />} />
        <Route path="/mail-backup" element={<MailBackupPage />} />
        <Route path="/proxy-pool" element={<ProxyPoolPage />} />
        <Route path="/renew-adobe-check" element={<RenewAdobePublicCheckPage />} />
        <Route path="/renew-orders" element={<RenewOrdersDeskPage />} />
        <Route path="*" element={<Navigate to="/renew-adobe-admin" replace />} />
      </Routes>
    </Suspense>
  );
}
