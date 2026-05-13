"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Right-most column. Pages push their own panel content via
 * `usePropertiesPanel({ title, children })`. If nothing is pushed, the
 * panel collapses to 0 width so the main column expands.
 */

interface PropertiesPanelContextValue {
  title: string | null;
  content: React.ReactNode | null;
  setPanel: (panel: { title: string; content: React.ReactNode } | null) => void;
}

const PropertiesPanelContext = React.createContext<PropertiesPanelContextValue | null>(null);

export function PropertiesPanelProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanelState] = React.useState<{ title: string; content: React.ReactNode } | null>(null);
  const value = React.useMemo<PropertiesPanelContextValue>(
    () => ({
      title: panel?.title ?? null,
      content: panel?.content ?? null,
      setPanel: setPanelState,
    }),
    [panel],
  );
  return (
    <PropertiesPanelContext.Provider value={value}>{children}</PropertiesPanelContext.Provider>
  );
}

export function usePropertiesPanel(panel: { title: string; content: React.ReactNode } | null) {
  const ctx = React.useContext(PropertiesPanelContext);
  React.useEffect(() => {
    ctx?.setPanel(panel);
    return () => ctx?.setPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel?.title, panel?.content]);
}

export function PropertiesPanel({ className }: { className?: string }) {
  const ctx = React.useContext(PropertiesPanelContext);
  if (!ctx?.content) return null;
  return (
    <aside
      className={cn(
        "flex h-full w-72 shrink-0 flex-col border-l border-border bg-card/30",
        className,
      )}
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {ctx.title}
      </div>
      <div className="flex-1 overflow-y-auto p-4">{ctx.content}</div>
    </aside>
  );
}
