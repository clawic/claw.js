"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Layers3,
  Filter,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { boardQueryKeys, fetchCompanyFixtures } from "@/lib/board-queries";
import { cn, relativeTime, formatDate } from "@/lib/utils";
import { Link } from "@/lib/router";
import type {
  PortfolioListItem,
  PortfolioItem,
  HealthStatus,
  PortfolioItemStatus,
  PortfolioItemType,
  AvailableAction,
} from "@/lib/company-types";

interface FixturesPayload {
  detail: {
    portfolioItems: PortfolioItem[];
  };
  portfolioList: PortfolioListItem[];
}

const healthDot: Record<HealthStatus, string> = {
  green: "bg-green-400",
  yellow: "bg-yellow-400",
  red: "bg-red-400",
  unknown: "bg-muted-foreground/50",
};

export default function PortfolioPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([{ label: "Portfolio" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: boardQueryKeys.companyFixtures(selectedCompanyId),
    queryFn: () => fetchCompanyFixtures<FixturesPayload>(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const portfolioList = data?.portfolioList ?? [];
  const allItems = data?.detail?.portfolioItems ?? [];

  const itemsByPortfolio = useMemo(() => {
    const map = new Map<string, PortfolioItem[]>();
    for (const item of allItems) {
      const list = map.get(item.portfolioId) ?? [];
      list.push(item);
      map.set(item.portfolioId, list);
    }
    return map;
  }, [allItems]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (healthFilter !== "all" && item.healthStatus !== healthFilter) return false;
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!item.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allItems, statusFilter, healthFilter, typeFilter, search]);

  const filteredItemIds = useMemo(() => new Set(filteredItems.map((i) => i.id)), [filteredItems]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="portfolio-error">
          <p className="text-sm text-red-300">Failed to load portfolio data.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="portfolio-page">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-medium text-foreground">Portfolio</h1>
          <span className="text-[11px] text-muted-foreground">({portfolioList.length} portfolios)</span>
        </div>
        <Button size="sm" data-testid="new-portfolio-item-cta">
          <Plus className="h-3 w-3" /> New portfolio item
        </Button>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2" data-testid="portfolio-filters">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs"
          data-testid="portfolio-search"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="portfolio-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="portfolio-filter-health">
            <SelectValue placeholder="Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All health</SelectItem>
            <SelectItem value="green">Healthy</SelectItem>
            <SelectItem value="yellow">At risk</SelectItem>
            <SelectItem value="red">Critical</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="portfolio-filter-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="app">App</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="saas">SaaS</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="brand">Brand</SelectItem>
            <SelectItem value="store">Store</SelectItem>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Portfolio groups */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {portfolioList.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            message="No portfolio items yet"
            action="Create portfolio item"
          />
        ) : (
          <div className="space-y-4" data-testid="portfolio-groups">
            {portfolioList.map((entry) => {
              const items = (itemsByPortfolio.get(entry.portfolio.id) ?? []).filter((i) => filteredItemIds.has(i.id));
              const isCollapsed = collapsed.has(entry.portfolio.id);

              return (
                <div key={entry.portfolio.id} className="rounded-lg border border-border bg-card/30" data-testid={`portfolio-group-${entry.portfolio.id}`}>
                  {/* Portfolio group header */}
                  <button
                    type="button"
                    onClick={() => toggleCollapse(entry.portfolio.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <BriefcaseBusiness className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm text-foreground">{entry.portfolio.name}</span>
                    <StatusBadge status={entry.portfolio.status} />
                    <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span>{entry.itemCount} items</span>
                      <span>{entry.activeProjects} active projects</span>
                      {entry.atRiskItems > 0 && (
                        <span className="text-red-400">{entry.atRiskItems} at risk</span>
                      )}
                    </div>
                  </button>

                  {/* Portfolio item rows */}
                  {!isCollapsed && items.length > 0 && (
                    <div className="border-t border-border">
                      {items.map((item) => (
                        <Link
                          key={item.id}
                          to={`/portfolio/${item.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/40 transition-colors border-b border-border last:border-b-0"
                          data-testid={`portfolio-item-${item.id}`}
                        >
                          <Layers3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground truncate min-w-0 flex-1">{item.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 w-14">{item.itemType}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 w-20">{item.lifecycleStage}</span>
                          <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", healthDot[item.healthStatus ?? "unknown"])} />
                          <StatusBadge status={item.status} />
                          <span className="text-[10px] text-muted-foreground shrink-0 w-14">{item.priority ?? "-"}</span>
                          {item.targetDate && (
                            <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(item.targetDate)}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}

                  {!isCollapsed && items.length === 0 && (
                    <div className="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
                      No items match filters.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
