"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CircleDot,
  LayoutDashboard,
  Inbox,
  Users,
  Target,
  ShieldCheck,
  Network,
  Settings,
  Building2,
  SquarePen,
  UserPlus,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { boardQueryKeys, fetchCompanyIssues } from "@/lib/board-queries";

export function CommandPalette() {
  const router = useRouter();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const {
    commandPaletteOpen,
    closeCommandPalette,
    toggleCommandPalette,
    openNewIssue,
    openNewAgent,
  } = useDialog();

  // ⌘K / Ctrl+K to toggle
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCommandPalette]);

  const { data: issues } = useQuery({
    queryKey: boardQueryKeys.commandPaletteIssues(selectedCompanyId),
    queryFn: () => fetchCompanyIssues(selectedCompanyId!),
    enabled: !!selectedCompanyId && commandPaletteOpen,
  });

  const nav = (to: string) => {
    closeCommandPalette();
    router.push(to);
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={(o) => !o && closeCommandPalette()}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => { closeCommandPalette(); openNewIssue(); }}>
            <SquarePen className="h-4 w-4" /> New issue
          </CommandItem>
          <CommandItem onSelect={() => { closeCommandPalette(); openNewAgent(); }}>
            <UserPlus className="h-4 w-4" /> Hire agent
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => nav("/dashboard")}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => nav("/inbox")}>
            <Inbox className="h-4 w-4" /> Inbox
          </CommandItem>
          <CommandItem onSelect={() => nav("/issues")}>
            <CircleDot className="h-4 w-4" /> Issues
          </CommandItem>
          <CommandItem onSelect={() => nav("/agents")}>
            <Users className="h-4 w-4" /> Agents
          </CommandItem>
          <CommandItem onSelect={() => nav("/org")}>
            <Network className="h-4 w-4" /> Org chart
          </CommandItem>
          <CommandItem onSelect={() => nav("/goals")}>
            <Target className="h-4 w-4" /> Goals
          </CommandItem>
          <CommandItem onSelect={() => nav("/approvals")}>
            <ShieldCheck className="h-4 w-4" /> Approvals
          </CommandItem>
          <CommandItem onSelect={() => nav("/settings")}>
            <Settings className="h-4 w-4" /> Settings
          </CommandItem>
        </CommandGroup>
        {companies.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch company">
              {companies.map((c) => (
                <CommandItem
                  key={c.id}
                  onSelect={() => {
                    setSelectedCompanyId(c.id);
                    closeCommandPalette();
                    router.push("/dashboard");
                  }}
                >
                  <Building2 className="h-4 w-4" /> {c.name}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {c.issuePrefix}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {issues && issues.issues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {issues.issues.slice(0, 10).map((issue) => (
                <CommandItem
                  key={issue.id}
                  onSelect={() => nav(`/${selectedCompanyId}/issues/${issue.id}`)}
                >
                  <CircleDot className="h-4 w-4" />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {issue.identifier}
                  </span>
                  <span className="truncate">{issue.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
