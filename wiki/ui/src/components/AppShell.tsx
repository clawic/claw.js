import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { PageTree } from "./PageTree";

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <aside
        className="w-[248px] flex-shrink-0 flex flex-col select-none"
        style={{ background: "var(--color-bg-sidebar)" }}
      >
        {/* Workspace header */}
        <div className="flex items-center gap-2 px-3 h-[44px] flex-shrink-0">
          <div
            className="w-[20px] h-[20px] rounded flex items-center justify-center text-[11px] font-bold"
            style={{ background: "var(--color-text)", color: "var(--color-bg-sidebar)" }}
          >
            C
          </div>
          <span className="text-[14px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
            ClawJS Wiki
          </span>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="px-2 mb-0.5">
          <div
            className="flex items-center gap-2 px-2 h-[28px] rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-0 outline-0 flex-1 text-[13px] placeholder:text-text-faint cursor-pointer focus:cursor-text"
              style={{ color: "var(--color-text)" }}
            />
          </div>
        </form>

        {/* Page tree */}
        <div className="flex-1 overflow-y-auto pt-1 pb-2">
          <PageTree />
        </div>

        {/* Footer */}
        <div className="px-2 pb-2 flex-shrink-0">
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-2 h-[28px] rounded text-[13px] transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: "var(--color-bg)" }}>
        <Outlet />
      </main>
    </div>
  );
}
