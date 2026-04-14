import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Search, LogOut } from "lucide-react";
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
    <div className="flex h-full w-full bg-bg-panel text-text">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-bg-sidebar border-r border-border flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <img src="/brand/logo.png" alt="ClawJS" width="20" height="20" />
          <span className="text-[15px] font-normal">
            Claw<strong>Wiki</strong>
          </span>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="px-3 py-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-input rounded text-text-muted">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search wiki..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-0 outline-0 flex-1 text-[13px] text-text placeholder:text-text-faint"
            />
          </div>
        </form>

        {/* Page tree */}
        <div className="flex-1 overflow-y-auto">
          <PageTree />
        </div>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-[13px] text-text-muted hover:text-text w-full px-2 py-1.5 rounded hover:bg-bg-hover transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
