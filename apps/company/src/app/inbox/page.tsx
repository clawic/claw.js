"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox as InboxIcon, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTabBar } from "@/components/PageTabBar";
import { IssueRow } from "@/components/IssueRow";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import type {
  Approval,
  CompanyAgent,
  Issue,
} from "@/lib/company-types";

interface CompanyDetailPayload {
  agents: CompanyAgent[];
  issues: Issue[];
  approvals: Approval[];
}

type Tab = "mine" | "recent" | "unread" | "all";

export default function InboxPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [tab, setTab] = useState<Tab>("mine");

  useEffect(() => {
    setBreadcrumbs([{ label: "Inbox" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading } = useQuery({
    queryKey: ["inbox", selectedCompanyId],
    queryFn: async (): Promise<CompanyDetailPayload> => {
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

  const { mineIssues, recentIssues, activeIssues, pendingApprovals } = useMemo(() => {
    const issues = data?.issues ?? [];
    const approvals = data?.approvals ?? [];
    const ceo = (data?.agents ?? []).find((a) => a.role === "ceo");
    const mine = issues.filter(
      (i) =>
        !ceo ||
        i.assigneeAgentId === ceo.id ||
        !i.assigneeAgentId ||
        i.createdByUserId,
    );
    const recent = [...issues].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const active = issues.filter((i) => i.status !== "done" && i.status !== "cancelled");
    const pending = approvals.filter((a) => a.status === "pending");
    return {
      mineIssues: [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      recentIssues: recent,
      activeIssues: active,
      pendingApprovals: pending,
    };
  }, [data]);

  const counts: Record<Tab, number> = {
    mine: mineIssues.length,
    recent: recentIssues.length,
    unread: activeIssues.length,
    all: (data?.issues ?? []).length,
  };

  const listByTab: Record<Tab, Issue[]> = {
    mine: mineIssues,
    recent: recentIssues,
    unread: activeIssues,
    all: data?.issues ?? [],
  };

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <InboxIcon className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Inbox</h1>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4">
          <PageTabBar
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            items={[
              { value: "mine", label: <TabLabel label="Mine" count={counts.mine} /> },
              { value: "recent", label: <TabLabel label="Recent" count={counts.recent} /> },
              { value: "unread", label: <TabLabel label="Active" count={counts.unread} /> },
              { value: "all", label: <TabLabel label="All" count={counts.all} /> },
            ]}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {pendingApprovals.length > 0 && tab === "mine" && (
            <section className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Pending approvals ({pendingApprovals.length})
                </h2>
              </div>
              <div className="space-y-1.5">
                {pendingApprovals.map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} />
                ))}
              </div>
            </section>
          )}

          {(["mine", "recent", "unread", "all"] as Tab[]).map((t) => (
            <TabsContent key={t} value={t} className="mt-0">
              {listByTab[t].length === 0 ? (
                <EmptyState icon={InboxIcon} message="Nothing here." />
              ) : (
                <div className="rounded-lg border border-border bg-card/30">
                  {listByTab[t].map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      href={`/issues/${issue.id}`}
                      assignee={issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {count > 0 && (
        <span className="rounded-full bg-muted px-1.5 text-[9px] leading-[16px]">{count}</span>
      )}
    </span>
  );
}
