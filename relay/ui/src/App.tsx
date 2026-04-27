import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./routes/Login";
import { AgentsPage } from "./routes/Agents";
import { WorkspacesPage } from "./routes/Workspaces";
import { ImmersiveBrowserPage } from "./routes/ImmersiveBrowser";
import { WorkspacePage } from "./routes/Workspace";
import { LogsPage } from "./routes/Logs";
import { MonitorPage } from "./routes/Monitor";
import { SettingsPage } from "./routes/Settings";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/browser/:tenantId/:agentId/:workspaceId"
        element={
          <ProtectedRoute>
            <ImmersiveBrowserPage />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/agents" replace />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route
          path="/workspace/:tenantId/:agentId/:workspaceId"
          element={<Navigate to="activity" replace />}
        />
        <Route
          path="/workspace/:tenantId/:agentId/:workspaceId/:tab"
          element={<WorkspacePage />}
        />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
