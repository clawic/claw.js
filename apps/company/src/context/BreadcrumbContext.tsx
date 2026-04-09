"use client";

import * as React from "react";

export interface Breadcrumb {
  label: string;
  to?: string;
}

interface BreadcrumbContextValue {
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (crumbs: Breadcrumb[]) => void;
}

const BreadcrumbContext = React.createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = React.useState<Breadcrumb[]>([]);
  const value = React.useMemo<BreadcrumbContextValue>(
    () => ({ breadcrumbs, setBreadcrumbs }),
    [breadcrumbs],
  );
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbs(): BreadcrumbContextValue {
  const ctx = React.useContext(BreadcrumbContext);
  if (!ctx) {
    return { breadcrumbs: [], setBreadcrumbs: () => {} };
  }
  return ctx;
}
