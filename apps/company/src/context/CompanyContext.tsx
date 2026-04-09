"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { Company } from "@/lib/company-types";

interface CompaniesApiResponse {
  companies: Company[];
}

interface CompanyContextValue {
  companies: Company[];
  loading: boolean;
  selectedCompanyId: string | null;
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string | null) => void;
  refetch: () => Promise<unknown>;
}

const CompanyContext = React.createContext<CompanyContextValue | null>(null);

const STORAGE_KEY = "clawjs-company.selectedCompanyId";

function readStoredId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [selectedCompanyId, setSelectedCompanyIdState] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedCompanyIdState(readStoredId());
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error(`failed to load companies: ${res.status}`);
      return (await res.json()) as CompaniesApiResponse;
    },
    refetchInterval: 15_000,
  });

  const companies = data?.companies ?? [];

  // If the selected id disappears, fall back to the first one.
  React.useEffect(() => {
    if (!companies.length) return;
    if (!selectedCompanyId || !companies.some((c) => c.id === selectedCompanyId)) {
      setSelectedCompanyIdState(companies[0].id);
      writeStoredId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  const setSelectedCompanyId = React.useCallback((id: string | null) => {
    setSelectedCompanyIdState(id);
    writeStoredId(id);
  }, []);

  const selectedCompany = React.useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const value = React.useMemo<CompanyContextValue>(
    () => ({
      companies,
      loading: isLoading,
      selectedCompanyId,
      selectedCompany,
      setSelectedCompanyId,
      refetch,
    }),
    [companies, isLoading, selectedCompanyId, selectedCompany, setSelectedCompanyId, refetch],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = React.useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used inside <CompanyProvider>");
  return ctx;
}
