"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  Target,
  CircleDot,
  Rocket,
  Filter,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
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
import { useDialog } from "@/context/DialogContext";
import { cn, relativeTime, formatDate } from "@/lib/utils";
import { Link } from "@/lib/router";
import type {
  CompanyDetailPayload,
  HealthStatus,
} from "@/lib/company-types";

const healthColor: Record<HealthStatus, string> = {
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  unknown: "text-muted-foreground",
};

export default function WorkPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openNewIssue } = useDialog();
  const [issueSearch, setIssueSearch] = useState("");
  const [issueStatus, setIssueStatus] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Work" }]);
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

  const goals = data?.goals ?? [];
  const projects = data?.projects ?? [];
  const issues = data?.issues ?? [];
  const releases = data?.releases ?? [];
  const agents = data?.agents ?? [];
  const portfolioItems = data?.portfolioItems ?? [];

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const itemById = useMemo(() => new Map(portfolioItems.map((i) => [i.id, i])), [portfolioItems]);

  const filteredIssues = useMemo(() => {
    return [...issues]
      .filter((i) => {
        if (issueStatus !== "all" && i.status !== issueStatus) return false;
        if (issueSearch.trim()) {
          const q = issueSearch.toLowerCase();
          if (!i.title.toLowerCase().includes(q) && !i.identifier.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [issues, issueStatus, issueSearch]);

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="work-error">
          <p className="text-sm text-red-300">Failed to load work data.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="work-page">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-medium text-foreground">Work</h1>
        </div>
        <Button size="sm" onClick={openNewIssue}>
          New issue
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8">
        {/* 1. Goals strip */}
        <section data-testid="work-goals">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Target className="h-3.5 w-3.5" /> Goals ({goals.length})
          </h2>
          {goals.length === 0 ? (
            <EmptyState icon={Target} message="No goals yet." />
          ) : (
            <div className="flex flex-wrap gap-3">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  className="rounded-lg border border-border bg-card p-3 min-w-[200px] max-w-xs flex-1"
                  data-testid={`goal-card-${goal.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">{goal.title}</span>
                    <StatusBadge status={goal.status} />
                  </div>
                  {goal.currentValue != null && goal.targetValue != null && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span>{goal.currentValue} / {goal.targetValue} {goal.unit ?? ""}</span>
                        <span className={cn("font-medium", healthColor[goal.healthStatus ?? "unknown"])}>
                          {goal.healthStatus ?? "unknown"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, (goal.currentValue / goal.targetValue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. Projects list */}
        <section data-testid="work-projects">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <FolderKanban className="h-3.5 w-3.5" /> Projects ({projects.length})
          </h2>
          {projects.length === 0 ? (
            <EmptyState icon={FolderKanban} message="No projects yet." />
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border bg-card p-3"
                  data-testid={`project-card-${p.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {p.kind && <span>{p.kind}</span>}
                    {p.healthStatus && (
                      <span className={cn("font-medium", healthColor[p.healthStatus])}>
                        {p.healthStatus}
                      </span>
                    )}
                    {p.leadAgentId && agentById.has(p.leadAgentId) && (
                      <span>Lead: {agentById.get(p.leadAgentId)!.title}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Issues table */}
        <section data-testid="work-issues">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <CircleDot className="h-3.5 w-3.5" /> Issues ({filteredIssues.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="work-issues-filters">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search issues..."
              value={issueSearch}
              onChange={(e) => setIssueSearch(e.target.value)}
              className="h-8 max-w-xs"
              data-testid="work-issues-search"
            />
            <Select value={issueStatus} onValueChange={setIssueStatus}>
              <SelectTrigger className="h-8 w-40 text-xs" data-testid="work-issues-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="todo">Todo</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="in_review">In review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredIssues.length === 0 ? (
            <EmptyState icon={CircleDot} message="No issues match your filters." />
          ) : (
            <div className="rounded-lg border border-border bg-card/30 overflow-x-auto" data-testid="issues-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">ID</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Priority</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Type</th>
                    <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Source</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Assignee</th>
                    <th className="px-3 py-2 text-left font-medium hidden xl:table-cell">Portfolio item</th>
                    <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((issue) => {
                    const assignee = issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null;
                    const linkedItem = issue.portfolioItemId ? itemById.get(issue.portfolioItemId) : null;
                    return (
                      <tr key={issue.id} className="border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2">
                          <Link to={`/issues/${issue.id}`} className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
                            {issue.identifier}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link to={`/issues/${issue.id}`} className="text-foreground hover:underline truncate block max-w-xs">
                            {issue.title}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <StatusIcon status={issue.status} showLabel />
                        </td>
                        <td className="px-3 py-2">
                          <PriorityIcon priority={issue.priority} showLabel />
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell text-[11px] text-muted-foreground">{issue.workType ?? "-"}</td>
                        <td className="px-3 py-2 hidden lg:table-cell text-[11px] text-muted-foreground">{issue.sourceDomain ?? "-"}</td>
                        <td className="px-3 py-2 hidden md:table-cell text-[11px] text-muted-foreground">{assignee?.title ?? "unassigned"}</td>
                        <td className="px-3 py-2 hidden xl:table-cell text-[11px] text-muted-foreground truncate max-w-28">{linkedItem?.name ?? "-"}</td>
                        <td className="px-3 py-2 hidden lg:table-cell text-[10px] text-muted-foreground">{issue.dueAt ? formatDate(issue.dueAt) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 4. Release board */}
        <section data-testid="work-releases">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Rocket className="h-3.5 w-3.5" /> Releases ({releases.length})
          </h2>
          {releases.length === 0 ? (
            <EmptyState icon={Rocket} message="No releases yet." />
          ) : (
            <div className="rounded-lg border border-border bg-card/30 overflow-x-auto" data-testid="release-board">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Planned</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Released</th>
                    <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {[...releases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((r) => {
                    const owner = r.ownerAgentId ? agentById.get(r.ownerAgentId) : null;
                    return (
                      <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors" data-testid={`release-row-${r.id}`}>
                        <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">{r.releaseType}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-2 hidden md:table-cell text-[11px] text-muted-foreground">{r.plannedAt ? formatDate(r.plannedAt) : "-"}</td>
                        <td className="px-3 py-2 hidden md:table-cell text-[11px] text-muted-foreground">{r.releasedAt ? formatDate(r.releasedAt) : "-"}</td>
                        <td className="px-3 py-2 hidden lg:table-cell text-[11px] text-muted-foreground">{owner?.title ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
