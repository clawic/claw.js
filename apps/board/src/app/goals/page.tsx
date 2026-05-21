"use client";

import { useEffect } from "react";
import { Target } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompanyDetailQuery } from "@/lib/board-queries";

export default function GoalsPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Goals" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading } = useCompanyDetailQuery(selectedCompanyId);

  if (isLoading) return <PageSkeleton />;

  const goals = data?.goals ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Target className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Goals</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {goals.length === 0 ? (
          <EmptyState icon={Target} message="No goals yet." />
        ) : (
          <div className="max-w-2xl space-y-2">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="flex items-start justify-between rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">{goal.title}</div>
                  {goal.description && (
                    <p className="mt-1 text-[12px] text-muted-foreground">{goal.description}</p>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">{goal.level}</div>
                </div>
                <StatusBadge status={goal.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
