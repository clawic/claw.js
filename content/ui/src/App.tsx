import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { getToken } from "./api/client";
import { Shell } from "./components/Shell";
import { LoginScreen } from "./screens/Login";
import { DashboardScreen } from "./screens/Dashboard";
import { CalendarScreen } from "./screens/Calendar";
import { PipelineScreen } from "./screens/Pipeline";
import { EntriesScreen } from "./screens/Entries";
import { EntryDetailScreen } from "./screens/EntryDetail";
import { ComposerScreen } from "./screens/Composer";
import { CampaignsScreen } from "./screens/Campaigns";
import { DestinationsScreen } from "./screens/Destinations";
import { ApprovalsScreen } from "./screens/Approvals";
import { PublicationsScreen } from "./screens/Publications";
import { SettingsAdaptersScreen } from "./screens/SettingsAdapters";

export function App() {
  const [authed, setAuthed] = useState(() => !!getToken());

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/pipeline" element={<PipelineScreen />} />
          <Route path="/entries" element={<EntriesScreen />} />
          <Route path="/entries/:entryId" element={<EntryDetailScreen />} />
          <Route path="/composer/:entryId" element={<ComposerScreen />} />
          <Route path="/campaigns" element={<CampaignsScreen />} />
          <Route path="/destinations" element={<DestinationsScreen />} />
          <Route path="/approvals" element={<ApprovalsScreen />} />
          <Route path="/publications" element={<PublicationsScreen />} />
          <Route path="/settings/adapters" element={<SettingsAdaptersScreen />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
