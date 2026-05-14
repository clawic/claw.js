import { useState } from "react";
import type React from "react";
import { ALL_CALENDARS_ID } from "@/lib/calendar-constants";
import { ALL_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import { useLocale } from "@/components/locale-provider";
import { Check } from "lucide-react";

export function terminalQrToDataUri(qrText: string): string {
  if (!qrText.trim()) return "";

  const lines = qrText.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "";

  const glyphs = lines.map((line) => Array.from(line));
  const width = Math.max(...glyphs.map((line) => line.length));
  const rows: boolean[][] = [];

  for (const line of glyphs) {
    const top = new Array<boolean>(width).fill(false);
    const bottom = new Array<boolean>(width).fill(false);

    for (let x = 0; x < width; x += 1) {
      const char = line[x] || " ";
      if (char === "█") {
        top[x] = true;
        bottom[x] = true;
      } else if (char === "▀") {
        top[x] = true;
      } else if (char === "▄") {
        bottom[x] = true;
      }
    }

    rows.push(top, bottom);
  }

  let path = "";
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rows[y][x]) {
        path += `M${x} ${y}h1v1H${x}Z`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ── small reusable components ────────────────────────────────────── */

export function TextInput({ value, onChange, placeholder, testId }: {
  value: string; onChange: (v: string) => void; placeholder?: string; testId?: string;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} autoCapitalize="sentences"
      data-testid={testId}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors" />
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      data-testid={testId}
      className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors disabled:bg-card disabled:text-tertiary-foreground ${value ? "text-foreground" : "text-muted-foreground"}`}
    >
      {placeholder && <option value="" disabled hidden>{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} className="text-foreground">{option.label}</option>
      ))}
    </select>
  );
}

export function TagsInput({ value, onChange, placeholder }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const { messages } = useLocale();
  const [inputVal, setInputVal] = useState("");
  const addTag = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !value.includes(trimmed)) { onChange([...value, trimmed]); setInputVal(""); }
  };
  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-card text-strong-foreground text-xs px-2.5 py-1 rounded-full transition-colors hover:bg-muted">
              {tag}
              <button onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-strong-foreground transition-colors ml-0.5">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder || messages.common.add} autoCapitalize="off"
          className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors" />
        <button onClick={addTag}
          className="px-3 py-1.5 bg-card text-strong-foreground rounded-lg text-xs hover:bg-muted transition-all active:scale-[0.96]">
          {messages.common.add}
        </button>
      </div>
    </div>
  );
}

export function Toggle({ enabled, onChange, disabled = false, testId }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${
        enabled ? "bg-foreground" : "bg-border-hover"
      }`}
      aria-pressed={enabled}
    >
      <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-card transition-transform shadow-sm ${
        enabled ? "translate-x-[18px]" : ""
      }`} />
    </button>
  );
}

export function TripleOptionSelector({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        const Icon = opt.icon;
        return (
          <button key={opt.value} type="button"
            onClick={() => onChange(opt.value)}
            className={`relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl text-center border transition-colors duration-200 h-full ${
              selected
                ? "border-[1.5px] border-foreground bg-foreground/[0.04] text-foreground"
                : "border-border/70 bg-background text-foreground hover:border-muted-foreground"
            }`}>
            {selected && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-foreground rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
              </span>
            )}
            <Icon className={`w-[18px] h-[18px] ${selected ? "text-foreground" : "text-muted-foreground"}`} />
            <span className={`text-[11px] ${selected ? "font-semibold" : "font-medium"}`}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MultiSelectChips({ selected, onChange, options }: {
  selected: string[];
  onChange: (v: string[]) => void;
  options: Array<{ value: string; label: string; desc: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <button key={opt.value} type="button"
            onClick={() => onChange(isSelected ? selected.filter((s) => s !== opt.value) : [...selected, opt.value])}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors duration-200 ${
              isSelected
                ? "border-foreground bg-foreground/[0.06] text-foreground font-medium"
                : "border-border/70 bg-card/50 text-foreground hover:border-muted-foreground hover:bg-card/70"
            }`}>
            <span className="font-medium">{opt.label}</span>
            <span className={`ml-1 text-[10px] ${isSelected ? "text-foreground/60" : "text-muted-foreground"}`}>{opt.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} rows={rows} autoCapitalize="sentences"
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors resize-none" />
  );
}

export function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-sm font-medium text-foreground mb-0.5">{title}</h2>
      <p className="text-xs text-muted-foreground mb-4">{hint}</p>
    </div>
  );
}

/* ── integration card ─────────────────────────────────────────────── */

export function IntegrationRow({
  icon,
  title,
  description,
  enabled,
  onToggle,
  status,
  detail,
  onRowClick,
  toggleDisabled = false,
  isFirst = false,
  isLast = false,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  status: "connected" | "syncing" | "installing" | "needs-app" | "pairing" | "waiting" | "connecting" | "disabled";
  detail?: string;
  onRowClick?: () => void;
  toggleDisabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  testId?: string;
}) {
  const statusDotColor = {
    connected: "bg-emerald-400",
    syncing: "bg-sky-500",
    installing: "bg-sky-500",
    "needs-app": "bg-amber-400",
    pairing: "bg-sky-500",
    waiting: "bg-sky-400",
    connecting: "bg-sky-500",
    disabled: "bg-border-hover",
  }[status];

  return (
    <div
      data-testid={testId ? `${testId}-card` : undefined}
      className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
        !isLast ? "border-b border-border" : ""
      } ${enabled && onRowClick ? "cursor-pointer hover:bg-background" : ""}`}
      onClick={enabled && onRowClick ? onRowClick : undefined}
    >
      {/* Icon with status dot */}
      <div className="relative flex-shrink-0">
        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
          !enabled ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
        }`}>
          {icon}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${statusDotColor}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-medium ${enabled ? "text-foreground" : "text-strong-foreground"}`}>{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>

      {/* Detail text or spinner */}
      {enabled && (status === "installing" || status === "connecting" || status === "syncing" || (status === "waiting" && !detail)) ? (
        <svg className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : enabled && detail ? (
        <span className="text-[10px] text-muted-foreground text-right max-w-[120px] truncate flex-shrink-0">{detail}</span>
      ) : null}

      {/* Toggle */}
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <Toggle
          enabled={enabled}
          onChange={onToggle}
          disabled={toggleDisabled}
          testId={testId ? `${testId}-toggle` : undefined}
        />
      </div>
    </div>
  );
}

export function IntegrationConfigModal({
  open,
  onClose,
  icon,
  title,
  statusLabel,
  children,
  doneDisabled,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  statusLabel?: string;
  children: React.ReactNode;
  doneDisabled?: boolean;
}) {
  const { messages } = useLocale();
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="mx-4 flex w-full max-w-[380px] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
          style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3.5 px-7 pt-6 pb-0">
            <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
              {icon}
            </div>
            <h3 className="text-[16px] font-semibold text-foreground flex-1">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {statusLabel && (
            <div className="flex items-center gap-1.5 px-7 pt-3 text-[11px] text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {statusLabel}
            </div>
          )}
          <div className="px-7 pt-4 pb-5 space-y-4">
            {children}
          </div>
          <div className="px-7 pb-6 pt-0 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={doneDisabled}
              className={`h-9 rounded-xl px-4 text-sm transition-colors ${
                doneDisabled
                  ? "bg-border text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-primary-foreground hover:bg-foreground-intense"
              }`}
            >
              {messages.settings.integrations.email.done}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── section wrapper ─────────────────────────────────────────────── */

export function SettingField({ label, hint, children }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-strong-foreground mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground mb-2">{hint}</p>}
      {children}
    </div>
  );
}

export function resolveSelectedEmailIds(
  selectedIds: string[],
  availableAccounts: Array<{ id: string; email: string }>
): string[] {
  if (!selectedIds.length) return [];
  if (selectedIds.includes(ALL_EMAIL_ACCOUNTS_ID)) {
    return availableAccounts.map((account) => account.id);
  }

  const resolved = new Set<string>();
  for (const selectedId of selectedIds) {
    const match = availableAccounts.find((account) => account.id === selectedId || account.email === selectedId);
    if (match) {
      resolved.add(match.id);
    }
  }

  return Array.from(resolved);
}

export function resolveSelectedCalendarIds(
  selectedIds: string[],
  availableCalendars: Array<{ id: string; title: string }>
): string[] {
  if (!selectedIds.length) return [];
  if (selectedIds.includes(ALL_CALENDARS_ID)) {
    return availableCalendars.map((cal) => cal.id);
  }

  const resolved = new Set<string>();
  for (const selectedId of selectedIds) {
    // Match by exact ID first, then fall back to legacy "title::index" format by title.
    const match = availableCalendars.find((cal) => cal.id === selectedId)
      || (selectedId.includes("::") && availableCalendars.find((cal) => cal.title === selectedId.split("::")[0]));
    if (match) {
      resolved.add(match.id);
    }
  }

  return Array.from(resolved);
}
