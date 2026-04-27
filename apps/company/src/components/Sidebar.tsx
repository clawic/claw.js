"use client";

/**
 * Second column: per-organization sidebar with cockpit navigation.
 */

import {
  LayoutDashboard,
  BriefcaseBusiness,
  FolderKanban,
  Activity,
  MessageSquareText,
  Bot,
  ShieldCheck,
  Settings,
  Search,
  SquarePen,
  FileSliders,
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
  feedbackItems: Array<{ id: string; status: string }>;
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
  const untriagedFeedback = data?.feedbackItems?.filter((f) => f.status === "new").length ?? 0;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-background" data-testid="sidebar">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        {selectedCompany?.brandColor && (
          <div
            className="ml-1 h-4 w-4 shrink-0 rounded-sm"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="flex-1 truncate pl-1 text-sm font-bold text-foreground">
          {selectedCompany?.name ?? "Select organization"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          onClick={openCommandPalette}
          title="Search"
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
          <SidebarNavItem to="/dashboard" label="Overview" icon={LayoutDashboard} />
        </div>

        <SidebarSection label="Portfolio">
          <SidebarNavItem to="/portfolio" label="Portfolio" icon={BriefcaseBusiness} />
        </SidebarSection>

        <SidebarSection label="Execution">
          <SidebarNavItem to="/work" label="Work" icon={FolderKanban} />
          <SidebarNavItem to="/operations" label="Operations" icon={Activity} />
          <SidebarNavItem
            to="/feedback"
            label="Feedback"
            icon={MessageSquareText}
            badge={untriagedFeedback || undefined}
            badgeTone={untriagedFeedback > 0 ? "danger" : "default"}
          />
        </SidebarSection>

        <SidebarSection label="Organization">
          <SidebarNavItem to="/agents" label="Agents" icon={Bot} />
          <SidebarNavItem to="/rules" label="Rules" icon={FileSliders} />
          <SidebarNavItem
            to="/approvals"
            label="Approvals"
            icon={ShieldCheck}
            badge={pendingApprovals || undefined}
            badgeTone={pendingApprovals > 0 ? "danger" : "default"}
          />
          <SidebarNavItem to="/settings" label="Settings" icon={Settings} />
        </SidebarSection>
      </nav>
    </aside>
  );
}
