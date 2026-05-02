import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-violet-500"
          aria-hidden
        />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
