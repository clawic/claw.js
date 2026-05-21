"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Layers3,
  FolderKanban,
  Target,
  Rocket,
  AlertTriangle,
  Activity,
  MessageSquareText,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTabBar } from "@/components/PageTabBar";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { boardQueryKeys, fetchCompanyFixtures } from "@/lib/board-queries";
import { useParams, Link } from "@/lib/router";
import { cn, relativeTime, formatDate } from "@/lib/utils";
import type {
  PortfolioItemOverview,
  AvailableAction,
  HealthStatus,
} from "@/lib/company-types";

type Tab = "projects" | "goals" | "releases" | "incidents" | "checks" | "feedback" | "metrics";

interface FixturesPayload {
  portfolioItemOverview: PortfolioItemOverview | null;
}

const healthColor: Record<HealthStatus, string> = {
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  unknown: "text-muted-foreground",
};

function ActionButtons({ actions }: { actions: AvailableAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex gap-1.5" data-testid="item-actions">
      {actions.map((action) => (
        <Button key={action} size="sm" variant="outline" className="text-xs h-7">
          {action.replace(/_/g, " ")}
        </Button>
      ))}
    </div>
  );
}

export default function PortfolioItemDetailPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { itemId } = useParams<{ itemId: string }>();
  const [tab, setTab] = useState<Tab>("projects");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: boardQueryKeys.companyFixtures(selectedCompanyId),
    queryFn: () => fetchCompanyFixtures<FixturesPayload>(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const overview = data?.portfolioItemOverview ?? null;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Portfolio", to: "/portfolio" },
      { label: overview?.portfolioItem?.name ?? "Item" },
    ]);
  }, [setBreadcrumbs, overview?.portfolioItem?.name]);

  if (isLoading) return <PageSkeleton variant="detail" />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="item-detail-error">
          <p className="text-sm text-red-300">Failed to load item detail.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-6">
        <EmptyState icon={Layers3} message="Portfolio item not found." />
      </div>
    );
  }

  const item = overview.portfolioItem;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="portfolio-item-detail">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/portfolio" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Layers3 className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">{item.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px]" data-testid="item-header-fields">
          <span className="text-muted-foreground">{item.itemType}</span>
          <StatusBadge status={item.status} />
          <span className="text-muted-foreground">{item.lifecycleStage}</span>
          <span className={cn("font-medium", healthColor[item.healthStatus ?? "unknown"])}>
            {item.healthStatus ?? "unknown"}
          </span>
          <span className="text-muted-foreground">{item.priority ?? "-"} priority</span>
          {item.targetDate && (
            <span className="text-muted-foreground">Target: {formatDate(item.targetDate)}</span>
          )}
        </div>
        <div className="mt-2">
          <ActionButtons actions={overview.availableActions} />
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4">
          <PageTabBar
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            items={[
              { value: "projects", label: `Projects (${overview.projects.length})` },
              { value: "goals", label: `Goals (${overview.goals.length})` },
              { value: "releases", label: `Releases (${overview.releases.length})` },
              { value: "incidents", label: `Incidents (${overview.incidents.length})` },
              { value: "checks", label: `Checks (${overview.checks.length})` },
              { value: "feedback", label: `Feedback (${overview.feedback.length})` },
              { value: "metrics", label: `Metrics (${overview.metrics.length})` },
            ]}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <TabsContent value="projects" className="mt-0">
            {overview.projects.length === 0 ? (
              <EmptyState icon={FolderKanban} message="No projects linked to this item." />
            ) : (
              <div className="space-y-2" data-testid="item-projects">
                {overview.projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{p.name}</span>
                    <StatusBadge status={p.status} />
                    {p.healthStatus && (
                      <span className={cn("text-[11px]", healthColor[p.healthStatus])}>{p.healthStatus}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="goals" className="mt-0">
            {overview.goals.length === 0 ? (
              <EmptyState icon={Target} message="No goals linked to this item." />
            ) : (
              <div className="space-y-2" data-testid="item-goals">
                {overview.goals.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{g.title}</span>
                    <StatusBadge status={g.status} />
                    {g.currentValue != null && g.targetValue != null && (
                      <span className="text-[11px] text-muted-foreground">
                        {g.currentValue}/{g.targetValue} {g.unit ?? ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="releases" className="mt-0">
            {overview.releases.length === 0 ? (
              <EmptyState icon={Rocket} message="No releases for this item." />
            ) : (
              <div className="space-y-2" data-testid="item-releases">
                {overview.releases.map((r) => (
                  <Link key={r.id} to="/work" className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-foreground/30 transition-colors">
                    <Rocket className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground">{r.releaseType}</span>
                    <StatusBadge status={r.status} />
                    {r.plannedAt && <span className="text-[10px] text-muted-foreground">{formatDate(r.plannedAt)}</span>}
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="incidents" className="mt-0">
            {overview.incidents.length === 0 ? (
              <EmptyState icon={AlertTriangle} message="No incidents for this item." />
            ) : (
              <div className="space-y-2" data-testid="item-incidents">
                {overview.incidents.map((inc) => (
                  <Link key={inc.id} to="/operations" className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-foreground/30 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{inc.title}</span>
                    <StatusBadge status={inc.severity} />
                    <StatusBadge status={inc.status} />
                    <span className="text-[10px] text-muted-foreground">{relativeTime(inc.startedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="checks" className="mt-0">
            {overview.checks.length === 0 ? (
              <EmptyState icon={Activity} message="No operational checks for this item." />
            ) : (
              <div className="space-y-2" data-testid="item-checks">
                {overview.checks.map((chk) => (
                  <div key={chk.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{chk.name}</span>
                    <span className="text-[10px] text-muted-foreground">{chk.domain}</span>
                    <StatusBadge status={chk.status} />
                    <StatusBadge status={chk.severity} />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="feedback" className="mt-0">
            {overview.feedback.length === 0 ? (
              <EmptyState icon={MessageSquareText} message="No feedback for this item." />
            ) : (
              <div className="space-y-2" data-testid="item-feedback">
                {overview.feedback.map((fb) => (
                  <div key={fb.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <MessageSquareText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{fb.title}</span>
                    <span className="text-[10px] text-muted-foreground">{fb.sourceType}</span>
                    <StatusBadge status={fb.status} />
                    {fb.sentiment && <StatusBadge status={fb.sentiment} />}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="metrics" className="mt-0">
            {overview.metrics.length === 0 ? (
              <EmptyState icon={BarChart3} message="No metrics captured for this item." />
            ) : (
              <div className="space-y-2" data-testid="item-metrics">
                {overview.metrics.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{m.metricLabel}</span>
                    <span className="text-sm font-semibold tabular-nums">{m.value} {m.unit ?? ""}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(m.capturedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
