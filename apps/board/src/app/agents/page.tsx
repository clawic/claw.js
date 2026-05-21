"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { PageTabBar } from "@/components/PageTabBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Identity } from "@/components/Identity";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useDialog } from "@/context/DialogContext";
import { boardQueryKeys, fetchCompanyAgents } from "@/lib/board-queries";
import type { CompanyAgent, CompanyAgentStatus } from "@/lib/company-types";

type Tab = "all" | "active" | "paused" | "pending_approval";

export default function AgentsPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openNewAgent } = useDialog();
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Agents" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: boardQueryKeys.companyAgents(selectedCompanyId),
    queryFn: () => fetchCompanyAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agents = data?.agents ?? [];
  const filtered = useMemo(() => {
    if (tab === "all") return agents;
    return agents.filter((a) => a.status === (tab as CompanyAgentStatus));
  }, [agents, tab]);

  const agentById = new Map(agents.map((a) => [a.id, a]));

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="agents-error">
          <p className="text-sm text-red-300">Failed to load agents.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="agents-page">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-medium text-foreground">Agents</h1>
          <span className="text-[11px] text-muted-foreground">({agents.length})</span>
        </div>
        <Button size="sm" onClick={openNewAgent} data-testid="hire-agent-cta">
          <UserPlus className="h-3 w-3" /> Hire
        </Button>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4">
          <PageTabBar
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            items={[
              { value: "all", label: `All (${agents.length})` },
              { value: "active", label: `Active (${agents.filter((a) => a.status === "active").length})` },
              { value: "paused", label: `Paused (${agents.filter((a) => a.status === "paused").length})` },
              { value: "pending_approval", label: `Pending (${agents.filter((a) => a.status === "pending_approval").length})` },
            ]}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {(["all", "active", "paused", "pending_approval"] as Tab[]).map((t) => (
            <TabsContent key={t} value={t} className="mt-0">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={Bot}
                  message="No agents in this bucket."
                  action="Hire a new agent"
                  onAction={openNewAgent}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((agent) => {
                    const manager = agent.reportsTo ? agentById.get(agent.reportsTo) : null;
                    return (
                      <div
                        key={agent.id}
                        className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30"
                        data-testid={`agent-card-${agent.id}`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <Identity name={agent.title} />
                          <StatusBadge status={agent.status} />
                        </div>

                        {/* Core fields per spec */}
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          <div><span className="text-muted-foreground/70">Name:</span> {agent.name}</div>
                          <div><span className="text-muted-foreground/70">Role:</span> {agent.role}</div>
                          <div><span className="text-muted-foreground/70">Adapter:</span> {agent.adapterType}</div>
                          {agent.scopeType && (
                            <div>
                              <span className="text-muted-foreground/70">Scope:</span> {agent.scopeType}
                              {agent.scopeId && <span className="ml-1 font-mono text-[10px]">({agent.scopeId})</span>}
                            </div>
                          )}
                          {agent.autonomyLevel && (
                            <div><span className="text-muted-foreground/70">Autonomy:</span> {agent.autonomyLevel.replace(/_/g, " ")}</div>
                          )}
                          {agent.watchDomains && agent.watchDomains.length > 0 && (
                            <div><span className="text-muted-foreground/70">Watch:</span> {agent.watchDomains.join(", ")}</div>
                          )}
                          {manager && (
                            <div><span className="text-muted-foreground/70">Reports to:</span> {manager.title}</div>
                          )}
                        </div>

                        {agent.capabilities && (
                          <p className="mt-2 line-clamp-3 text-[12px] text-muted-foreground">
                            {agent.capabilities}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
