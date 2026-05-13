import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  Rss,
  Layers,
  FolderOpen,
  Search,
  Settings,
  LogOut,
  BarChart3,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/timeline", label: "Timeline", icon: Rss },
  { to: "/sources", label: "Sources", icon: Layers },
  { to: "/collections", label: "Collections", icon: FolderOpen },
  { to: "/search", label: "Search", icon: Search },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { logout } = useAuth();

  return (
    <div className="flex h-screen">
      <nav className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <BarChart3 className="h-5 w-5 text-brand-400" />
          <span className="text-lg font-bold text-zinc-100">Feed</span>
        </div>

        <div className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </nav>

      <main className="flex-1 overflow-auto bg-zinc-950">
        <Outlet />
      </main>
    </div>
  );
}
