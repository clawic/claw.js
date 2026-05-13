"use client";

/**
 * Left-most column: vertical rail listing companies. Click to select,
 * plus a "+" button to create a new company.
 */

import { Plus, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function CompanyRail() {
  const router = useRouter();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/60 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mb-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <Building2 className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">ClawJS Company</TooltipContent>
      </Tooltip>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {companies.map((company) => {
          const active = company.id === selectedCompanyId;
          return (
            <Tooltip key={company.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCompanyId(company.id);
                    router.push("/dashboard");
                  }}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg text-[11px] font-semibold transition-all",
                    active
                      ? "bg-foreground text-background shadow-md scale-[1.02]"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  style={
                    company.brandColor
                      ? {
                          backgroundColor: active ? company.brandColor : undefined,
                          color: active ? "#fff" : undefined,
                        }
                      : undefined
                  }
                >
                  {active && !company.brandColor && (
                    <span className="absolute -left-3 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-foreground" />
                  )}
                  {companyInitials(company.name)}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs font-medium">{company.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{company.issuePrefix}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => router.push("/new")}
            className="mt-2 flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">New company</TooltipContent>
      </Tooltip>
    </aside>
  );
}
