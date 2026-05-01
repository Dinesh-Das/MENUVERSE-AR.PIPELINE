import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { ModelARPage } from "./pages/ModelARPage";
import { ModelDetailsPage } from "./pages/ModelDetailsPage";
import { ModelPreviewPage } from "./pages/ModelPreviewPage";
import { UploadModelPage } from "./pages/UploadModelPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/upload" element={<UploadModelPage />} />
        <Route path="/models/:id" element={<ModelDetailsPage />} />
        <Route path="/models/:id/preview" element={<ModelPreviewPage />} />
        <Route path="/models/:id/ar" element={<ModelARPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
