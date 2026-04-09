"use client";

import { useEffect } from "react";
import { Settings } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";

export default function SettingsPage() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Settings" }]);
  }, [setBreadcrumbs]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-lg space-y-4">
          {selectedCompany && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm font-medium text-foreground">{selectedCompany.name}</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {selectedCompany.issuePrefix}
              </div>
              {selectedCompany.description && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {selectedCompany.description}
                </p>
              )}
            </div>
          )}
          <EmptyState icon={Settings} message="Company settings coming soon." />
        </div>
      </div>
    </div>
  );
}
