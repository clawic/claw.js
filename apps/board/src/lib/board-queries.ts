"use client";

import * as React from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CompanyAgent,
  CompanyDashboardPayload,
  CompanyDetailPayload,
  CompanySidebarPayload,
  ImportBatch,
  Issue,
} from "./company-types";

interface CompaniesApiResponse {
  companies: CompanyDetailPayload["company"][];
}

export const BOARD_COMPANY_STALE_TIME_MS = 30_000;
export const BOARD_COMPANY_FALLBACK_INTERVAL_MS = 30_000;

export const boardQueryKeys = {
  companies: ["companies"] as const,
  companyDetail: (companyId?: string | null) => ["companyDetail", companyId] as const,
  companySidebar: (companyId?: string | null) => ["companySidebar", companyId] as const,
  companySummary: (companyId?: string | null) => ["companySummary", companyId] as const,
  companyAgents: (companyId?: string | null) => ["companyAgents", companyId] as const,
  companyFixtures: (companyId?: string | null) => ["companyFixtures", companyId] as const,
  companyImports: (companyId?: string | null) => ["companyImports", companyId] as const,
  commandPaletteIssues: (companyId?: string | null) => ["commandPaletteIssues", companyId] as const,
};

async function readJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label}: ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchCompanies(): Promise<CompaniesApiResponse> {
  return readJson<CompaniesApiResponse>(await fetch("/api/companies"), "failed to load companies");
}

export async function fetchCompanyDetail(companyId: string): Promise<CompanyDetailPayload> {
  return readJson<CompanyDetailPayload>(await fetch(`/api/companies/${companyId}`), "failed to load company");
}

export async function fetchCompanySidebar(companyId: string): Promise<CompanySidebarPayload> {
  return readJson<CompanySidebarPayload>(
    await fetch(`/api/companies/${companyId}/sidebar`),
    "failed to load company sidebar",
  );
}

export async function fetchCompanySummary(companyId: string): Promise<CompanyDashboardPayload> {
  return readJson<CompanyDashboardPayload>(
    await fetch(`/api/companies/${companyId}/summary`),
    "failed to load company summary",
  );
}

export async function fetchCompanyAgents(companyId: string): Promise<{ agents: CompanyAgent[] }> {
  return readJson<{ agents: CompanyAgent[] }>(
    await fetch(`/api/companies/${companyId}/agents`),
    "failed to load agents",
  );
}

export async function fetchCompanyFixtures<T>(companyId: string): Promise<T> {
  return readJson<T>(await fetch(`/api/companies/${companyId}/fixtures`), "failed to load fixtures");
}

export async function fetchCompanyImports(companyId: string): Promise<{ imports: ImportBatch[] }> {
  return readJson<{ imports: ImportBatch[] }>(
    await fetch(`/api/companies/${companyId}/metrics/imports`),
    "failed to load imports",
  );
}

export async function fetchCompanyIssues(companyId: string): Promise<{ issues: Issue[] }> {
  return readJson<{ issues: Issue[] }>(
    await fetch(`/api/companies/${companyId}/issues`),
    "failed to load issues",
  );
}

export function useCompaniesQuery() {
  return useQuery({
    queryKey: boardQueryKeys.companies,
    queryFn: fetchCompanies,
    staleTime: BOARD_COMPANY_STALE_TIME_MS,
  });
}

export function useCompanyDetailQuery(companyId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: boardQueryKeys.companyDetail(companyId),
    queryFn: () => fetchCompanyDetail(companyId!),
    enabled: Boolean(companyId) && options?.enabled !== false,
    staleTime: BOARD_COMPANY_STALE_TIME_MS,
  });
}

export function useCompanySidebarQuery(companyId: string | null | undefined) {
  return useQuery({
    queryKey: boardQueryKeys.companySidebar(companyId),
    queryFn: () => fetchCompanySidebar(companyId!),
    enabled: Boolean(companyId),
    staleTime: BOARD_COMPANY_STALE_TIME_MS,
  });
}

export function useCompanySummaryQuery(companyId: string | null | undefined) {
  return useQuery({
    queryKey: boardQueryKeys.companySummary(companyId),
    queryFn: () => fetchCompanySummary(companyId!),
    enabled: Boolean(companyId),
    staleTime: BOARD_COMPANY_STALE_TIME_MS,
  });
}

export function invalidateCompanyQueries(queryClient: QueryClient, companyId?: string | null): Promise<unknown[]> {
  const keys = companyId
    ? [
        boardQueryKeys.companyDetail(companyId),
        boardQueryKeys.companySidebar(companyId),
        boardQueryKeys.companySummary(companyId),
        boardQueryKeys.companyAgents(companyId),
        boardQueryKeys.companyFixtures(companyId),
        boardQueryKeys.companyImports(companyId),
        boardQueryKeys.commandPaletteIssues(companyId),
      ]
    : [
        boardQueryKeys.companies,
        ["companyDetail"] as const,
        ["companySidebar"] as const,
        ["companySummary"] as const,
        ["companyAgents"] as const,
        ["companyFixtures"] as const,
        ["companyImports"] as const,
        ["commandPaletteIssues"] as const,
      ];
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useCompanyFallbackInvalidation(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!companyId || typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void invalidateCompanyQueries(queryClient, companyId);
    }, BOARD_COMPANY_FALLBACK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [companyId, queryClient]);
}
