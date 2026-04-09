import { NavLink, useNavigate } from "react-router-dom";
import {
  Bot,
  FolderOpenDot,
  LogOut,
  Moon,
  ScrollText,
  Settings,
  Sun,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

type Item = {
  to: string;
  label: string;
  icon: typeof Bot;
  adminOnly?: boolean;
  match?: (pathname: string) => boolean;
};

const ITEMS: Item[] = [
  { to: "/agents", label: "Agents", icon: Bot },
  {
    to: "/workspaces",
    label: "Workspaces",
    icon: FolderOpenDot,
    // Highlight Workspaces when inside a specific workspace too.
    match: (p) => p.startsWith("/workspaces") || p.startsWith("/workspace/"),
  },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function Rail() {
  const { isAdmin, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const visible = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav
      aria-label="Primary"
      className="flex flex-col items-center w-[75px] shrink-0 bg-bg-rail border-r border-border py-5 gap-5"
    >
      {/* Brand mark */}
      <div className="mt-[14px] mb-[6px] grid place-items-center">
        <img src="/brand/logo.png" alt="ClawJS" width="32" height="32" />
      </div>

      <div className="flex-1 flex flex-col items-center gap-2">
        {visible.map(({ to, label, icon: Icon, match }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            aria-label={label}
            className={({ isActive }) => {
              const active = match?.(window.location.pathname) ?? isActive;
              return [
                "w-11 h-11 flex items-center justify-center rounded transition-colors",
                "text-text-muted hover:bg-bg-hover hover:text-text",
                active ? "bg-bg-hover text-text" : "",
              ].join(" ");
            }}
          >
            <Icon size={20} strokeWidth={1.75} />
          </NavLink>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label="Toggle theme"
          className="w-11 h-11 flex items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text"
        >
          {theme === "dark" ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          title="Sign out"
          aria-label="Sign out"
          className="w-11 h-11 flex items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text"
        >
          <LogOut size={20} strokeWidth={1.75} />
        </button>
      </div>
    </nav>
  );
}
