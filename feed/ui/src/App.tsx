import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./routes/Login";
import { FeedTimeline } from "./routes/FeedTimeline";
import { SourceList } from "./routes/SourceList";
import { SourceDetail } from "./routes/SourceDetail";
import { ItemView } from "./routes/ItemView";
import { CollectionList } from "./routes/CollectionList";
import { CollectionView } from "./routes/CollectionView";
import { SearchPage } from "./routes/SearchPage";
import { SettingsPage } from "./routes/SettingsPage";

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
        <Route index element={<Navigate to="/timeline" replace />} />
        <Route path="/timeline" element={<FeedTimeline />} />
        <Route path="/sources" element={<SourceList />} />
        <Route path="/sources/:sourceId" element={<SourceDetail />} />
        <Route path="/items/:itemId" element={<ItemView />} />
        <Route path="/collections" element={<CollectionList />} />
        <Route path="/collections/:collectionId" element={<CollectionView />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
