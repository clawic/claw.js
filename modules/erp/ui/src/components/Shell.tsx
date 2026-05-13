import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type AppMeta } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useRealtime } from "../hooks/useRealtime";
import { CommandPalette } from "./CommandPalette";
import { JobBanner } from "./JobBanner";

const MODULE_ICONS: Record<string, string> = {
  dashboard: "\u25a3",
  finance: "\u2261",
  sales: "\u25b2",
  purchase: "\u25bc",
  inventory: "\u25a1",
  mrp: "\u2699",
  projects: "\u25c7",
  hr: "\u25cb",
  payroll: "\u2261",
  support: "\u25ce",
  dms: "\u25a0",
  bi: "\u25c6",
  admin: "\u2318",
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  finance: "Finance",
  sales: "Sales",
  purchase: "Purchase",
  inventory: "Inventory",
  mrp: "Manufacturing",
  projects: "Projects",
  hr: "HR",
  payroll: "Payroll",
  support: "Support",
  dms: "Documents",
  bi: "BI",
  admin: "Admin",
};

export function Shell({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showPalette, setShowPalette] = useState(false);
  const { data: meta, refresh: refreshMeta } = useApi<AppMeta>(() => api.meta(), []);

  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  useEffect(() => {
    if (meta) {
      const ctx = api.getContext();
      if (ctx.tenantId) setSelectedTenant(ctx.tenantId);
      if (ctx.legalEntityId) setSelectedEntity(ctx.legalEntityId);
      if (meta.shell.branchSwitcher.length > 0 && !selectedBranch) {
        setSelectedBranch(meta.shell.branchSwitcher[0].id);
      }
    }
  }, [meta, selectedBranch]);

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Realtime events trigger meta refresh
  const handleRealtimeEvent = useCallback(() => {
    refreshMeta();
  }, [refreshMeta]);
  useRealtime(handleRealtimeEvent);

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tid = e.target.value;
    setSelectedTenant(tid);
    const entity = meta?.shell.legalEntityOptions[0];
    if (entity) {
      api.setContext(tid, entity.id);
      setSelectedEntity(entity.id);
    }
    refreshMeta();
  };

  const handleEntityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const eid = e.target.value;
    setSelectedEntity(eid);
    api.setContext(selectedTenant, eid);
    refreshMeta();
  };

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBranch(e.target.value);
  };

  // Build breadcrumbs from path
  const pathParts = location.pathname.split("/").filter(Boolean);
  const breadcrumbs = pathParts.map((part, i) => ({
    label: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " "),
    path: "/" + pathParts.slice(0, i + 1).join("/"),
  }));

  const syncStatus = meta?.shell.syncStatus ?? "healthy";
  const runningJobs = meta?.shell.runningJobs ?? [];
  const approvalCount = meta?.badges.approvals ?? 0;
  const navigation = meta?.navigation ?? [];

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">ERP</div>
        <div className="sidebar-nav">
          {navigation.map((mod) => (
            <NavLink
              key={mod}
              to={`/${mod === "dashboard" ? "dashboard" : mod}`}
              className={({ isActive }) =>
                `sidebar-item${isActive || location.pathname.startsWith(`/${mod}`) ? " active" : ""}`
              }
            >
              <span>{MODULE_ICONS[mod] ?? "\u25cf"}</span>
              {MODULE_LABELS[mod] ?? mod}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <select
              data-testid="shell-tenant-selector"
              className="topbar-selector"
              value={selectedTenant}
              onChange={handleTenantChange}
            >
              {meta?.shell.tenantOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>

            <select
              data-testid="shell-legal-entity-selector"
              className="topbar-selector"
              value={selectedEntity}
              onChange={handleEntityChange}
            >
              {meta?.shell.legalEntityOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>

            <select
              data-testid="shell-branch-switcher"
              className="topbar-selector"
              value={selectedBranch}
              onChange={handleBranchChange}
            >
              {meta?.shell.branchSwitcher.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>

            <input
              data-testid="shell-global-search"
              className="topbar-search"
              type="text"
              placeholder="Search... (Ctrl+K)"
              onFocus={() => setShowPalette(true)}
              readOnly
            />
          </div>

          <div className="topbar-right">
            <button data-testid="shell-inbox" className="topbar-btn" title="Inbox">
              Inbox
            </button>

            <button data-testid="shell-approvals" className="topbar-btn" title="Approvals" onClick={() => navigate("/admin/approvals")}>
              Approvals
              {approvalCount > 0 && <span className="topbar-badge">{approvalCount}</span>}
            </button>

            <button data-testid="shell-alerts" className="topbar-btn" title="Alerts">
              Alerts
            </button>

            <div data-testid="shell-sync-status" className="sync-badge" title={`Sync: ${syncStatus}`}>
              <span className={`sync-dot ${syncStatus}`} />
              <span data-testid="sync-status-badge">{syncStatus}</span>
            </div>

            <button data-testid="shell-job-status" className="topbar-btn" title="Jobs">
              Jobs{runningJobs.length > 0 && ` (${runningJobs.length})`}
            </button>

            <span data-testid="shell-localization-badge" className="topbar-btn" title="Localization">
              {meta?.shell.localizationBadge ?? "---"}
            </span>

            <button data-testid="shell-profile" className="topbar-btn" onClick={onLogout} title="Profile / Logout">
              Admin
            </button>
          </div>
        </header>

        <div data-testid="shell-breadcrumbs" className="breadcrumbs">
          <a href="/dashboard">Home</a>
          {breadcrumbs.map((bc, i) => (
            <span key={bc.path}>
              <span className="sep"> / </span>
              {i === breadcrumbs.length - 1 ? (
                <span>{bc.label}</span>
              ) : (
                <a href={bc.path}>{bc.label}</a>
              )}
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={refreshMeta}>
            Refresh
          </button>
        </div>

        <div className="content">
          {runningJobs.map((job) => (
            <JobBanner key={job.id} job={job} />
          ))}
          <Outlet />
        </div>
      </div>

      {showPalette && (
        <CommandPalette
          data-testid="shell-command-palette"
          onClose={() => setShowPalette(false)}
          onNavigate={(path) => { navigate(path); setShowPalette(false); }}
          navigation={navigation}
        />
      )}
    </div>
  );
}
