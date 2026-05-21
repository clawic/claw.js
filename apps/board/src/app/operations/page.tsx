"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { boardQueryKeys, fetchCompanyFixtures } from "@/lib/board-queries";
import { cn, relativeTime, formatDateTime } from "@/lib/utils";
import type {
  OperationsBoard,
  OperationalCheck,
  OperationalIncident,
  PortfolioItem,
} from "@/lib/company-types";

interface FixturesPayload {
  operations: OperationsBoard;
}

const severityColor: Record<string, string> = {
  sev1: "border-red-500/40 bg-red-500/5",
  sev2: "border-orange-500/40 bg-orange-500/5",
  sev3: "border-yellow-500/40 bg-yellow-500/5",
  sev4: "border-border",
};

const checkStatusColor: Record<string, string> = {
  ok: "bg-green-400",
  degraded: "bg-yellow-400",
  failed: "bg-red-400",
  unknown: "bg-muted-foreground/50",
};

export default function OperationsPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Operations" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: boardQueryKeys.companyFixtures(selectedCompanyId),
    queryFn: () => fetchCompanyFixtures<FixturesPayload>(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="operations-error">
          <p className="text-sm text-red-300">Failed to load operations data.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  const ops = data?.operations;
  if (!ops) return <PageSkeleton />;

  const openIncidents = ops.openIncidents;
  const failedChecks = ops.checksByStatus.failed;
  const degradedChecks = ops.checksByStatus.degraded;
  const atRiskItems = ops.atRiskItems;
  const allChecks = [
    ...ops.checksByStatus.failed,
    ...ops.checksByStatus.degraded,
    ...ops.checksByStatus.ok,
    ...ops.checksByStatus.unknown,
  ];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="operations-page">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Operations</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {/* Top row metrics */}
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="operations-metrics">
          <MetricCard
            icon={AlertTriangle}
            value={openIncidents.length}
            label="Open incidents"
            dataTestId="ops-metric-incidents"
          />
          <MetricCard
            icon={ShieldAlert}
            value={failedChecks.length}
            label="Failed checks"
            dataTestId="ops-metric-failed-checks"
          />
          <MetricCard
            icon={Activity}
            value={degradedChecks.length}
            label="Degraded checks"
            dataTestId="ops-metric-degraded-checks"
          />
          <MetricCard
            icon={AlertTriangle}
            value={atRiskItems.length}
            label="At-risk items"
            dataTestId="ops-metric-at-risk"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Left: Incident queue */}
          <section data-testid="incident-queue">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Incident queue ({openIncidents.length})
            </h2>
            {openIncidents.length === 0 ? (
              <EmptyState icon={AlertTriangle} message="No open incidents." />
            ) : (
              <div className="space-y-2">
                {openIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className={cn("rounded-lg border p-4", severityColor[inc.severity] ?? "border-border")}
                    data-testid={`incident-card-${inc.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm text-foreground">{inc.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge status={inc.severity} />
                        <StatusBadge status={inc.status} />
                      </div>
                    </div>
                    {inc.summary && (
                      <p className="text-[12px] text-muted-foreground mb-2 line-clamp-2">{inc.summary}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>Started {relativeTime(inc.startedAt)}</span>
                      {inc.portfolioItemId && <span>Item: {inc.portfolioItemId}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Right: Checks grouped by status */}
          <section data-testid="checks-board">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Health checks ({allChecks.length})
            </h2>
            {allChecks.length === 0 ? (
              <EmptyState icon={Activity} message="No health checks configured." />
            ) : (
              <div className="space-y-4">
                {(["failed", "degraded", "ok", "unknown"] as const).map((status) => {
                  const checks = ops.checksByStatus[status];
                  if (checks.length === 0) return null;
                  return (
                    <div key={status}>
                      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <span className={cn("inline-block h-2 w-2 rounded-full", checkStatusColor[status])} />
                        {status} ({checks.length})
                      </h3>
                      <div className="space-y-1.5">
                        {checks.map((chk) => (
                          <div
                            key={chk.id}
                            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                            data-testid={`check-card-${chk.id}`}
                          >
                            <span className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", checkStatusColor[chk.status])} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-foreground block truncate">{chk.name}</span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                <span>{chk.domain}</span>
                                <StatusBadge status={chk.severity} />
                                <span>{chk.sourceType}</span>
                                {chk.lastObservedAt && <span>{relativeTime(chk.lastObservedAt)}</span>}
                              </div>
                              {chk.detail && (
                                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{chk.detail}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
