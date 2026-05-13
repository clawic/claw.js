import { useState, useEffect, useRef } from "react";

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

interface Props {
  onClose: () => void;
  onNavigate: (path: string) => void;
  navigation: string[];
  "data-testid"?: string;
}

export function CommandPalette({ onClose, onNavigate, navigation, ...rest }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const items = navigation
    .map((mod) => ({ id: mod, label: MODULE_LABELS[mod] ?? mod, path: `/${mod}` }))
    .filter((item) => !query || item.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="command-palette-overlay" onClick={onClose} data-testid={rest["data-testid"]}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command or search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette-results">
          {items.map((item) => (
            <div
              key={item.id}
              className="command-palette-item"
              onClick={() => onNavigate(item.path)}
            >
              {item.label}
              <span className="shortcut">{item.path}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
