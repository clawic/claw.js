"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CircleDot,
  ShieldCheck,
  LayoutDashboard,
  Activity,
  Target,
  AlertTriangle,
  MessageSquareText,
  Rocket,
  BriefcaseBusiness,
  Building2,
} from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ApprovalCard } from "@/components/ApprovalCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useDialog } from "@/context/DialogContext";
import { cn, relativeTime } from "@/lib/utils";
import { Link } from "@/lib/router";
import type { CompanyDetailPayload, SummaryMetric } from "@/lib/company-types";

const toneColor: Record<string, string> = {
  neutral: "border-border",
  positive: "border-green-500/30",
  warning: "border-yellow-500/30",
  critical: "border-red-500/30",
};

function SummaryCard({ metric, icon: Icon, testId }: { metric: SummaryMetric; icon: React.ElementType; testId: string }) {
  const inner = (
    <div
      data-testid={testId}
      className={cn(
        "rounded-lg border px-4 py-4 sm:px-5 sm:py-5 transition-colors",
        toneColor[metric.tone ?? "neutral"] ?? toneColor.neutral,
        metric.href && "hover:bg-accent/50 cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums">{metric.value}</p>
          <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">{metric.label}</p>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1.5" />
      </div>
    </div>
  );

  if (metric.href) {
    return <Link to={metric.href} className="no-underline text-inherit">{inner}</Link>;
  }
  return inner;
}

const activityTypeIcon: Record<string, React.ElementType> = {
  issue: CircleDot,
  release: Rocket,
  incident: AlertTriangle,
  feedback: MessageSquareText,
  run: Activity,
  approval: ShieldCheck,
};

export default function DashboardPage() {
  const { selectedCompanyId, selectedCompany, loading, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openOnboarding, openNewAgent } = useDialog();

  useEffect(() => {
    setBreadcrumbs([{ label: "Overview" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["company-detail", selectedCompanyId],
    queryFn: async (): Promise<CompanyDetailPayload> => {
      const res = await fetch(`/api/companies/${selectedCompanyId}`);
      if (!res.ok) throw new Error("load failed");
      return res.json();
    },
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  if (loading) return <PageSkeleton variant="dashboard" />;

  if (!selectedCompanyId && companies.length === 0) {
    return (
      <div className="p-10">
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome. Set up your first organization to get started."
          action="Get started"
          onAction={openOnboarding}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="overview-error">
          <p className="text-sm text-red-300">Failed to load organization data.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!selectedCompany || isLoading || !data) {
    return <PageSkeleton variant="dashboard" />;
  }

  const { company, summary, approvals, agents } = data;
  const activeAgents = agents.filter((a) => a.status === "active" && a.adapterType !== "human");
  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  return (
    <div className="space-y-6 p-6" data-testid="dashboard-page">
      {/* 1. Page header */}
      <div className="flex items-center gap-3" data-testid="overview-header">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">{company.name}</h1>
          {company.description && (
            <p className="text-sm text-muted-foreground">{company.description}</p>
          )}
        </div>
      </div>

      {activeAgents.length === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300/40 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-sm text-amber-100">You have no agents hired yet.</p>
          </div>
          <button
            type="button"
            onClick={openNewAgent}
            className="text-sm font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200"
          >
            Hire your first agent
          </button>
        </div>
      )}

      {/* 2. Primary metrics row */}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="primary-metrics">
        <SummaryCard metric={summary.activeGoals} icon={Target} testId="metric-active-goals" />
        <SummaryCard metric={summary.projectsInProgress} icon={BriefcaseBusiness} testId="metric-projects-in-progress" />
        <SummaryCard metric={summary.pendingApprovals} icon={ShieldCheck} testId="metric-pending-approvals" />
        <SummaryCard metric={summary.runningRuns} icon={Activity} testId="metric-running-runs" />
      </div>

      {/* 3. Executive metrics row */}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="executive-summary-grid">
        <SummaryCard metric={summary.openIncidents} icon={AlertTriangle} testId="metric-open-incidents" />
        <SummaryCard metric={summary.untriagedFeedback} icon={MessageSquareText} testId="metric-untriaged-feedback" />
        <SummaryCard metric={summary.plannedReleases} icon={Rocket} testId="metric-planned-releases" />
        <SummaryCard metric={summary.itemsAtRisk} icon={BriefcaseBusiness} testId="metric-items-at-risk" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* 4. Recent issues (left, wide) */}
        <section className="xl:col-span-2 space-y-4">
          <div>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Recent issues
            </h2>
            {data.issues.length === 0 ? (
              <EmptyState icon={CircleDot} message="No issues yet." />
            ) : (
              <div className="space-y-0.5 rounded-lg border border-border bg-card/30 py-2" data-testid="recent-issues-list">
                {[...data.issues]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .slice(0, 8)
                  .map((issue) => {
                    const assignee = issue.assigneeAgentId
                      ? agents.find((a) => a.id === issue.assigneeAgentId)
                      : null;
                    return (
                      <Link
                        key={issue.id}
                        to={`/issues/${issue.id}`}
                        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-16 truncate">
                          {issue.identifier}
                        </span>
                        <span className="flex-1 truncate text-foreground">{issue.title}</span>
                        <StatusBadge status={issue.status} />
                        {assignee && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-24">{assignee.title}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(issue.updatedAt)}</span>
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        </section>

        {/* Right column: portfolio watch, pending approvals, recent activity */}
        <section className="space-y-4">
          {/* 5. Portfolio watch */}
          <div>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Portfolio watch
            </h2>
            {summary.healthByItem.length === 0 ? (
              <EmptyState icon={BriefcaseBusiness} message="No portfolio items yet." />
            ) : (
              <div className="space-y-1 rounded-lg border border-border bg-card/30 p-2" data-testid="portfolio-watch-list">
                {summary.healthByItem.map((item) => (
                  <Link
                    key={item.portfolioItemId}
                    to={`/portfolio/${item.portfolioItemId}`}
                    className="flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-accent/40 rounded transition-colors"
                  >
                    <span
                      className={cn(
                        "inline-block h-2 w-2 shrink-0 rounded-full",
                        item.healthStatus === "green"
                          ? "bg-green-400"
                          : item.healthStatus === "yellow"
                          ? "bg-yellow-400"
                          : item.healthStatus === "red"
                          ? "bg-red-400"
                          : "bg-muted-foreground/50",
                      )}
                    />
                    <span className="truncate text-foreground">{item.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {item.openIncidents} incidents, {item.openIssues} issues
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 6. Pending approvals */}
          <div>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Pending approvals
            </h2>
            {pendingApprovals.length === 0 ? (
              <EmptyState icon={ShieldCheck} message="All clear." />
            ) : (
              <div className="space-y-1.5" data-testid="pending-approvals-list">
                {pendingApprovals.slice(0, 4).map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} compact />
                ))}
              </div>
            )}
          </div>

          {/* 7. Recent activity */}
          <div>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Recent activity
            </h2>
            {summary.recentActivity.length === 0 ? (
              <EmptyState icon={Activity} message="No recent activity." />
            ) : (
              <div className="space-y-1 rounded-lg border border-border bg-card/30 p-2" data-testid="recent-activity-list">
                {summary.recentActivity.map((item) => {
                  const TypeIcon = activityTypeIcon[item.type] ?? Activity;
                  return (
                    <Link
                      key={`${item.type}-${item.id}`}
                      to={item.href ?? "#"}
                      className="flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-accent/40 rounded transition-colors"
                    >
                      <TypeIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">{item.title}</span>
                      <StatusBadge status={item.status} />
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {relativeTime(item.timestamp)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
