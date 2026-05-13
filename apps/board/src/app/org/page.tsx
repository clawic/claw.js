"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Identity } from "@/components/Identity";
import { StatusBadge } from "@/components/StatusBadge";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type { CompanyAgent } from "@/lib/company-types";

interface TreeNode {
  agent: CompanyAgent;
  children: TreeNode[];
}

function buildTree(agents: CompanyAgent[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const a of agents) byId.set(a.id, { agent: a, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.agent.reportsTo ? byId.get(node.agent.reportsTo) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  for (const node of byId.values()) {
    node.children.sort((a, b) => a.agent.title.localeCompare(b.agent.title));
  }
  roots.sort((a, b) => {
    if (a.agent.role === "ceo") return -1;
    if (b.agent.role === "ceo") return 1;
    return a.agent.title.localeCompare(b.agent.title);
  });
  return roots;
}

function OrgNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <div className={cn("relative", depth > 0 && "ml-6 border-l border-border pl-6")}>
      <div className="relative my-1.5 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        {depth > 0 && (
          <span className="absolute -left-6 top-1/2 h-0.5 w-6 bg-border" aria-hidden />
        )}
        <Identity name={node.agent.title} />
        <div className="flex-1 text-[11px] text-muted-foreground">
          {node.agent.name} · {node.agent.role}
        </div>
        <StatusBadge status={node.agent.status} />
      </div>
      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <OrgNode key={child.agent.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Org chart" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading } = useQuery({
    queryKey: ["agents", selectedCompanyId],
    queryFn: async (): Promise<{ agents: CompanyAgent[] }> => {
      const res = await fetch(`/api/companies/${selectedCompanyId}/agents`);
      if (!res.ok) throw new Error("load failed");
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });

  const tree = useMemo(() => buildTree(data?.agents ?? []), [data]);

  if (isLoading) return <PageSkeleton />;

  if (!tree.length) {
    return (
      <div className="p-10">
        <EmptyState icon={Network} message="No agents hired yet." />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Network className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Org chart</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-3xl">
          {tree.map((root) => (
            <OrgNode key={root.agent.id} node={root} />
          ))}
        </div>
      </div>
    </div>
  );
}
