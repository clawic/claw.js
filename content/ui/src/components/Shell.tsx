import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useSyncStatus } from "../hooks/useWebSocket";
import { getBrands } from "../api/client";
import type { Brand } from "../api/types";
import "./Shell.css";

const NAV_ITEMS = [
  { to: "/dashboard",  label: "Dashboard",     icon: "◫" },
  { to: "/calendar",   label: "Calendar",      icon: "▦" },
  { to: "/pipeline",   label: "Pipeline",      icon: "⟶" },
  { to: "/entries",     label: "Entries",       icon: "☰" },
  { to: "/campaigns",  label: "Campaigns",     icon: "◎" },
  { to: "/destinations",label: "Destinations", icon: "◉" },
  { to: "/approvals",  label: "Approvals",     icon: "✓" },
  { to: "/publications",label: "Publications", icon: "▸" },
  { to: "/settings/adapters", label: "Settings", icon: "⚙" },
];

const SYNC_LABELS: Record<string, { text: string; cls: string }> = {
  connected:    { text: "Live",          cls: "sync--healthy" },
  disconnected: { text: "Offline",       cls: "sync--offline" },
  reconnecting: { text: "Reconnecting",  cls: "sync--reconnecting" },
};

function buildBreadcrumbs(pathname: string): Array<{ label: string; path: string }> {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [];
  let path = "";
  for (const p of parts) {
    path += "/" + p;
    crumbs.push({ label: p.charAt(0).toUpperCase() + p.slice(1), path });
  }
  return crumbs;
}

export function Shell() {
  const syncStatus = useSyncStatus();
  const location = useLocation();
  const crumbs = buildBreadcrumbs(location.pathname);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    getBrands().then((r) => setBrands(r.brands)).catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sync = SYNC_LABELS[syncStatus] ?? SYNC_LABELS.disconnected;

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside className={`shell__sidebar ${mobileOpen ? "shell__sidebar--open" : ""}`}>
        <div className="shell__logo">
          <img src="/brand/logo.png" alt="ClawJS Content" className="shell__logo-img" />
          <span className="shell__logo-text">Content</span>
        </div>
        <nav className="shell__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `shell__nav-item ${isActive ? "shell__nav-item--active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <span className="shell__nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="shell__main">
        {/* Top bar */}
        <header className="shell__topbar">
          <button className="shell__hamburger" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">☰</button>

          <div data-testid="shell-breadcrumbs" className="shell__breadcrumbs">
            {crumbs.map((c, i) => (
              <span key={c.path}>
                {i > 0 && <span className="shell__breadcrumb-sep">/</span>}
                <span className={i === crumbs.length - 1 ? "shell__breadcrumb--current" : ""}>{c.label}</span>
              </span>
            ))}
          </div>

          <div className="shell__topbar-controls">
            <select
              data-testid="shell-brand-selector"
              className="shell__control-select"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
            >
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <select data-testid="shell-destination-scope" className="shell__control-select" defaultValue="">
              <option value="">All destinations</option>
            </select>

            <input data-testid="shell-calendar-range" type="text" className="shell__control-input" placeholder="Date range" readOnly />

            <button data-testid="shell-global-search" className="shell__control-btn" aria-label="Search">
              ⌕
            </button>

            <button
              data-testid="shell-command-palette"
              className="shell__control-btn"
              onClick={() => setCommandPaletteOpen(!commandPaletteOpen)}
              aria-label="Command palette"
            >
              ⌘K
            </button>

            <button data-testid="shell-approvals" className="shell__control-btn" aria-label="Pending approvals">
              ✓
            </button>

            <div data-testid="shell-jobs" className="shell__control-btn" aria-label="Jobs">
              ▸
            </div>

            <div data-testid="shell-sync-status" className={`shell__sync ${sync.cls}`}>
              <span className="shell__sync-dot" />
              <span className="shell__sync-label">{sync.text}</span>
            </div>

            <button data-testid="shell-profile" className="shell__control-btn shell__profile" aria-label="Profile">
              A
            </button>
          </div>
        </header>

        {/* Content area */}
        <main className="shell__content">
          <Outlet />
        </main>
      </div>

      {/* Command palette overlay */}
      {commandPaletteOpen && (
        <div className="dialog-overlay" onClick={() => setCommandPaletteOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <input
              autoFocus
              className="input"
              placeholder="Type a command or search..."
              style={{ fontSize: "var(--fs-md)" }}
            />
            <div style={{ padding: "var(--sp-4)", color: "var(--c-text-muted)", fontSize: "var(--fs-sm)" }}>
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="shell__palette-item"
                  onClick={() => setCommandPaletteOpen(false)}
                >
                  <span>{item.icon}</span> {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile overlay */}
      {mobileOpen && <div className="shell__mobile-overlay" onClick={() => setMobileOpen(false)} />}
    </div>
  );
}
