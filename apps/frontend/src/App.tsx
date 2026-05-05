import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { LoginPage } from "@/features/auth";
import { AuthProvider } from "./AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import AppNotification from "./components/modals/AppNotification";
import { isPublicRenewHost } from "@/lib/publicRenewHost";

const RenewAdobePublicCheckPage = lazy(
  () => import("@/features/renew-adobe/storefront-check/RenewAdobePublicCheckPage"),
);

const AuthedLayout = lazy(() => import("./AuthedLayout"));

const ShellSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-950">
    <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-600 border-t-violet-500" />
  </div>
);

function PublicRenewOnlyRoutes() {
  return (
    <Suspense fallback={<ShellSpinner />}>
      <RenewAdobePublicCheckPage />
    </Suspense>
  );
}

/** otp90.com / www → chỉ form Renew công khai; subdomain admin.* → SPA đầy đủ. */
function AppShell() {
  if (typeof window !== "undefined" && isPublicRenewHost()) {
    return (
      <Routes>
        <Route path="*" element={<PublicRenewOnlyRoutes />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Suspense fallback={<ShellSpinner />}>
              <AuthedLayout />
            </Suspense>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppNotification />
          <AppShell />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
