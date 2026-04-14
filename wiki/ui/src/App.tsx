import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./routes/Login";
import { SpaceHome } from "./routes/SpaceHome";
import { PageView } from "./routes/PageView";
import { PageEdit } from "./routes/PageEdit";
import { SearchPanel } from "./components/SearchPanel";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/main" replace />} />
        <Route path="/search" element={<SearchPanel />} />
        <Route path="/:spaceId" element={<SpaceHome />} />
        <Route path="/:spaceId/new/edit" element={<PageEdit />} />
        <Route path="/:spaceId/:pageSlug" element={<PageView />} />
        <Route path="/:spaceId/:pageSlug/edit" element={<PageEdit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
