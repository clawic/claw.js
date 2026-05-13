"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTabBar } from "@/components/PageTabBar";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { ApprovalCard } from "@/components/ApprovalCard";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { relativeTime, formatDateTime } from "@/lib/utils";
import type { Approval } from "@/lib/company-types";

type Tab = "pending" | "all";

export default function ApprovalsPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [tab, setTab] = useState<Tab>("pending");

  useEffect(() => {
    setBreadcrumbs([{ label: "Approvals" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["company-detail", selectedCompanyId],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${selectedCompanyId}`);
      if (!res.ok) throw new Error("load failed");
      return (await res.json()) as { approvals: Approval[] };
    },
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const all = data?.approvals ?? [];
  const pending = all.filter((a) => a.status === "pending");

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="approvals-error">
          <p className="text-sm text-red-300">Failed to load approvals.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  const renderApprovalRow = (a: Approval) => {
    const payload = (a.payload ?? {}) as Record<string, unknown>;
    return (
      <div key={a.id} className="rounded-lg border border-border bg-card p-4" data-testid={`approval-row-${a.id}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={a.type.replace(/_/g, " ")} />
              <StatusBadge status={a.status} />
            </div>
            {a.reason && (
              <p className="text-sm text-foreground">{a.reason}</p>
            )}
          </div>
        </div>

        {/* Spec fields: type, reason, status, requested by, decided by, decided at, payload preview */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2">
          <div><span className="text-muted-foreground/70">Type:</span> {a.type.replace(/_/g, " ")}</div>
          <div><span className="text-muted-foreground/70">Status:</span> {a.status}</div>
          {a.requestedByAgentId && (
            <div><span className="text-muted-foreground/70">Requested by:</span> {a.requestedByAgentId}</div>
          )}
          {a.requestedByUserId && (
            <div><span className="text-muted-foreground/70">Requested by:</span> {a.requestedByUserId}</div>
          )}
          {a.decidedByUserId && (
            <div><span className="text-muted-foreground/70">Decided by:</span> {a.decidedByUserId}</div>
          )}
          {a.decidedAt && (
            <div><span className="text-muted-foreground/70">Decided at:</span> {formatDateTime(a.decidedAt)}</div>
          )}
          <div><span className="text-muted-foreground/70">Created:</span> {relativeTime(a.createdAt)}</div>
        </div>

        {/* Payload preview */}
        {Object.keys(payload).length > 0 && (
          <details className="mt-2">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
              Payload preview
            </summary>
            <pre className="mt-1 rounded bg-muted/50 p-2 text-[10px] text-muted-foreground overflow-x-auto max-h-32">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        )}

        {/* Actions */}
        {a.status === "pending" && (
          <div className="mt-3 border-t border-border pt-3">
            <ApprovalCard approval={a} compact />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="approvals-page">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Approvals</h1>
        <span className="text-[11px] text-muted-foreground">({pending.length} pending)</span>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4">
          <PageTabBar
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            items={[
              { value: "pending", label: `Pending (${pending.length})` },
              { value: "all", label: `All (${all.length})` },
            ]}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <TabsContent value="pending" className="mt-0 space-y-3">
            {pending.length === 0 ? (
              <EmptyState icon={ShieldCheck} message="All clear. No pending approvals." />
            ) : (
              pending.map(renderApprovalRow)
            )}
          </TabsContent>
          <TabsContent value="all" className="mt-0 space-y-3">
            {all.length === 0 ? (
              <EmptyState icon={ShieldCheck} message="No approvals yet." />
            ) : (
              all.map(renderApprovalRow)
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
