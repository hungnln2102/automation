import { MainLayout } from "./components/layout/MainLayout";
import { AppRoutes } from "./routes/AppRoutes";

/** Chunk lazy — chỉ tải khi đã qua ProtectedRoute (có session). */
export default function AuthedLayout() {
  return (
    <MainLayout>
      <AppRoutes />
    </MainLayout>
  );
}
