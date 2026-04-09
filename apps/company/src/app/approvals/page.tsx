"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTabBar } from "@/components/PageTabBar";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import type { Approval } from "@/lib/company-types";

type Tab = "pending" | "all";

export default function ApprovalsPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [tab, setTab] = useState<Tab>("pending");

  useEffect(() => {
    setBreadcrumbs([{ label: "Approvals" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading } = useQuery({
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Approvals</h1>
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
          <TabsContent value="pending" className="mt-0 space-y-2">
            {pending.length === 0 ? (
              <EmptyState icon={ShieldCheck} message="All clear. No pending approvals." />
            ) : (
              pending.map((a) => <ApprovalCard key={a.id} approval={a} />)
            )}
          </TabsContent>
          <TabsContent value="all" className="mt-0 space-y-2">
            {all.length === 0 ? (
              <EmptyState icon={ShieldCheck} message="No approvals yet." />
            ) : (
              all.map((a) => <ApprovalCard key={a.id} approval={a} />)
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
