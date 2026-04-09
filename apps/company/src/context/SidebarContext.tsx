"use client";

import * as React from "react";

interface SidebarContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  isMobile: boolean;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

const MOBILE_BREAKPOINT = 768;
const STORAGE_KEY = "clawjs-company.sidebarOpen";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(false);
  const [sidebarOpen, setSidebarOpenState] = React.useState(true);

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw != null) setSidebarOpenState(raw === "1");
    } catch {
      // ignore
    }
  }, []);

  const setSidebarOpen = React.useCallback((open: boolean) => {
    setSidebarOpenState(open);
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setSidebarOpen(!sidebarOpen);
  }, [sidebarOpen, setSidebarOpen]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({ sidebarOpen, setSidebarOpen, toggleSidebar, isMobile }),
    [sidebarOpen, setSidebarOpen, toggleSidebar, isMobile],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) {
    // Fallback so primitives still render even if someone renders them
    // outside the provider (e.g. in isolated tests).
    return {
      sidebarOpen: true,
      setSidebarOpen: () => {},
      toggleSidebar: () => {},
      isMobile: false,
    };
  }
  return ctx;
}
