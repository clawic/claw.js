"use client";

/**
 * Second column: per-company sidebar with Work/Team/Company sections.
 */

import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  Network,
  SquarePen,
  Settings,
  ShieldCheck,
  Search,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { Button } from "@/components/ui/button";

interface CompanyPayload {
  agents: Array<{ id: string; status: string }>;
  issues: Array<{ id: string; status: string; assigneeAgentId?: string }>;
  approvals: Array<{ id: string; status: string }>;
}

export function Sidebar() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { openNewIssue, openCommandPalette } = useDialog();

  const { data } = useQuery({
    queryKey: ["company-sidebar", selectedCompanyId],
    queryFn: async (): Promise<CompanyPayload> => {
      const res = await fetch(`/api/companies/${selectedCompanyId}`);
      if (!res.ok) throw new Error("sidebar load failed");
      return (await res.json()) as CompanyPayload;
    },
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const pendingApprovals = data?.approvals.filter((a) => a.status === "pending").length ?? 0;
  const openIssues = data?.issues.filter((i) => i.status !== "done" && i.status !== "cancelled").length ?? 0;
  const activeAgents = data?.agents.filter((a) => a.status === "active").length ?? 0;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        {selectedCompany?.brandColor && (
          <div
            className="ml-1 h-4 w-4 shrink-0 rounded-sm"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="flex-1 truncate pl-1 text-sm font-bold text-foreground">
          {selectedCompany?.name ?? "Select company"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          onClick={openCommandPalette}
          title="Search (⌘K)"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={openNewIssue}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">New Issue</span>
          </button>
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={pendingApprovals || undefined}
            badgeTone={pendingApprovals > 0 ? "danger" : "default"}
          />
        </div>

        <SidebarSection label="Work">
          <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} badge={openIssues || undefined} />
          <SidebarNavItem to="/goals" label="Goals" icon={Target} />
          <SidebarNavItem to="/approvals" label="Approvals" icon={ShieldCheck} badge={pendingApprovals || undefined} />
        </SidebarSection>

        <SidebarSection label="Team">
          <SidebarNavItem to="/agents" label="Agents" icon={Users} badge={activeAgents || undefined} />
          <SidebarNavItem to="/org" label="Org chart" icon={Network} />
        </SidebarSection>

        <SidebarSection label="Company">
          <SidebarNavItem to="/settings" label="Settings" icon={Settings} />
        </SidebarSection>
      </nav>
    </aside>
  );
}
