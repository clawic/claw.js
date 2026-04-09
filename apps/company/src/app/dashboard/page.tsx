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
} from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { IssueRow } from "@/components/IssueRow";
import { ApprovalCard } from "@/components/ApprovalCard";
import { Identity } from "@/components/Identity";
import { StatusIcon } from "@/components/StatusIcon";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useDialog } from "@/context/DialogContext";
import { cn, relativeTime } from "@/lib/utils";
import type {
  Approval,
  CompanyAgent,
  Goal,
  Issue,
  Project,
  Run,
} from "@/lib/company-types";

interface CompanyDetailPayload {
  agents: CompanyAgent[];
  issues: Issue[];
  approvals: Approval[];
  goals: Goal[];
  projects: Project[];
  runs: Run[];
}

export default function DashboardPage() {
  const { selectedCompanyId, selectedCompany, loading, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openOnboarding, openNewAgent } = useDialog();

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading } = useQuery({
    queryKey: ["company-detail", selectedCompanyId],
    queryFn: async (): Promise<CompanyDetailPayload> => {
      const res = await fetch(`/api/companies/${selectedCompanyId}`);
      if (!res.ok) throw new Error("load failed");
      return res.json();
    },
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  if (loading) return <PageSkeleton />;

  if (!selectedCompanyId && companies.length === 0) {
    return (
      <div className="p-10">
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to ClawJS Company. Set up your first company to get started."
          action="Get started"
          onAction={openOnboarding}
        />
      </div>
    );
  }

  if (!selectedCompany || isLoading || !data) {
    return <PageSkeleton variant="dashboard" />;
  }

  const { agents, issues, approvals, goals, runs } = data;
  const activeAgents = agents.filter((a) => a.status === "active" && a.adapterType !== "human");
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const openIssues = issues.filter((i) => i.status !== "done" && i.status !== "cancelled");
  const inProgress = issues.filter((i) => i.status === "in_progress");
  const doneIssues = issues.filter((i) => i.status === "done");
  const runningRuns = runs.filter((r) => r.status === "running" || r.status === "queued");
  const recentRuns = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const recentIssues = [...issues]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  const agentById = new Map(agents.map((a) => [a.id, a]));

  return (
    <div className="space-y-6 p-6">
      {activeAgents.length === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300/40 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-sm text-amber-100">
              You have no agents hired yet.
            </p>
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

      <div className="grid grid-cols-2 gap-1 sm:gap-2 xl:grid-cols-4">
        <MetricCard
          icon={Bot}
          value={activeAgents.length}
          label="Agents active"
          description={
            <span>
              {runningRuns.length} running · {agents.filter((a) => a.status === "paused").length} paused
            </span>
          }
          to="/agents"
        />
        <MetricCard
          icon={CircleDot}
          value={inProgress.length}
          label="Tasks in progress"
          description={
            <span>
              {openIssues.length} open · {doneIssues.length} done
            </span>
          }
          to="/issues"
        />
        <MetricCard
          icon={ShieldCheck}
          value={pendingApprovals.length}
          label="Pending approvals"
          description={<span>{approvals.length} total</span>}
          to="/approvals"
        />
        <MetricCard
          icon={Target}
          value={goals.filter((g) => g.status === "active").length}
          label="Active goals"
          description={<span>{goals.length} total</span>}
          to="/goals"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Recent issues
            </h2>
          </div>
          {recentIssues.length === 0 ? (
            <EmptyState icon={CircleDot} message="No issues yet." />
          ) : (
            <div className="space-y-0.5 rounded-lg border border-border bg-card/30 py-2">
              {recentIssues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  href={`/issues/${issue.id}`}
                  assignee={issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null}
                  dense
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Pending approvals
            </h2>
            {pendingApprovals.length === 0 ? (
              <EmptyState icon={ShieldCheck} message="All clear." />
            ) : (
              <div className="space-y-1.5">
                {pendingApprovals.slice(0, 4).map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} compact />
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Recent runs
            </h2>
            {recentRuns.length === 0 ? (
              <EmptyState icon={Activity} message="No agent runs yet." />
            ) : (
              <div className="space-y-1 rounded-lg border border-border bg-card/30 p-2">
                {recentRuns.map((run) => {
                  const agent = agentById.get(run.agentId);
                  const issue = issues.find((i) => i.id === run.issueId);
                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-2 px-2 py-1.5 text-[12px]"
                    >
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-full",
                          run.status === "running"
                            ? "animate-pulse bg-cyan-400"
                            : run.status === "succeeded"
                            ? "bg-green-400"
                            : run.status === "failed"
                            ? "bg-red-400"
                            : "bg-yellow-400",
                        )}
                      />
                      <span className="truncate text-muted-foreground">
                        {agent?.title ?? "agent"}
                      </span>
                      {issue && (
                        <>
                          <StatusIcon status={issue.status} />
                          <span className="truncate font-mono text-[10px] text-muted-foreground">
                            {issue.identifier}
                          </span>
                        </>
                      )}
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {relativeTime(run.createdAt)}
                      </span>
                    </div>
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
