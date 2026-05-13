"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDot, Filter } from "lucide-react";
import { IssueRow } from "@/components/IssueRow";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import type { CompanyAgent, Issue, IssueStatus } from "@/lib/company-types";

interface PagePayload {
  agents: CompanyAgent[];
  issues: Issue[];
}

export default function IssuesPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openNewIssue } = useDialog();
  const [status, setStatus] = useState<IssueStatus | "all">("all");
  const [assigneeId, setAssigneeId] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Issues" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading } = useQuery({
    queryKey: ["issues", selectedCompanyId],
    queryFn: async (): Promise<PagePayload> => {
      const res = await fetch(`/api/companies/${selectedCompanyId}`);
      if (!res.ok) throw new Error("load failed");
      return res.json();
    },
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const agentById = useMemo(() => {
    const m = new Map<string, CompanyAgent>();
    for (const a of data?.agents ?? []) m.set(a.id, a);
    return m;
  }, [data?.agents]);

  const filtered = useMemo(() => {
    const rows = (data?.issues ?? []).filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (assigneeId !== "all" && i.assigneeAgentId !== assigneeId) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!i.title.toLowerCase().includes(q) && !i.identifier.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
    return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [data, status, assigneeId, search]);

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-medium text-foreground">Issues</h1>
          <span className="text-[11px] text-muted-foreground">({filtered.length})</span>
        </div>
        <Button size="sm" onClick={openNewIssue}>
          New issue
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by title or identifier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-8 w-40 text-xs">
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
        <Select value={assigneeId} onValueChange={setAssigneeId}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {(data.agents ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <EmptyState icon={CircleDot} message="No issues match your filters." />
        ) : (
          <div className="rounded-lg border border-border bg-card/30">
            {filtered.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                href={`/issues/${issue.id}`}
                assignee={issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
