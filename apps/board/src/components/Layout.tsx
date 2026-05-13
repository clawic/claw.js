"use client";

import * as React from "react";
import { CompanyRail } from "./CompanyRail";
import { Sidebar } from "./Sidebar";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { PropertiesPanel } from "./PropertiesPanel";
import { NewIssueDialog } from "./NewIssueDialog";
import { NewAgentDialog } from "./NewAgentDialog";
import { OnboardingWizard } from "./OnboardingWizard";
import { CommandPalette } from "./CommandPalette";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { companies, loading } = useCompany();
  const { openOnboarding, onboardingOpen } = useDialog();
  const triggered = React.useRef(false);

  React.useEffect(() => {
    if (loading || triggered.current) return;
    if (companies.length === 0) {
      triggered.current = true;
      openOnboarding();
    }
  }, [companies, loading, openOnboarding]);

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-background text-foreground">
      <CompanyRail />
      <Sidebar />
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <BreadcrumbBar />
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </div>
      <PropertiesPanel />

      {/* Global dialogs */}
      <NewIssueDialog />
      <NewAgentDialog />
      {(onboardingOpen || companies.length === 0) && !loading && <OnboardingWizard />}
      <CommandPalette />
    </div>
  );
}
