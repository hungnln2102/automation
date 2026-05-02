import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { LoginPage } from "@/features/auth";
import { AuthProvider } from "./AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { MainLayout } from "./components/layout/MainLayout";
import { AppRoutes } from "./routes/AppRoutes";
import AppNotification from "./components/modals/AppNotification";

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppNotification />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <AppRoutes />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
