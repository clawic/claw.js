"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileSliders, GitBranch, Loader2, Play, ShieldCheck } from "lucide-react";
import type { RuleRecord, RuleScope, RulesCompileResult } from "@clawjs/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";

interface RulesPayload {
  scopes: RuleScope[];
  rules: RuleRecord[];
  status: {
    scopes: number;
    rules: number;
    pending: number;
    active: number;
    archived: number;
  };
}

async function postRules<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/rules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("rules request failed");
  return res.json() as Promise<T>;
}

export default function RulesPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [compilePrompt, setCompilePrompt] = useState("Build a website for Northstar Studio.");
  const [compileResult, setCompileResult] = useState<RulesCompileResult | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Rules" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["rules"],
    queryFn: async (): Promise<RulesPayload> => {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("rules load failed");
      return res.json();
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => postRules<RuleRecord>({ action: "approve", id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const compile = useMutation({
    mutationFn: async () => postRules<RulesCompileResult>({
      action: "compile",
      input: {
        prompt: compilePrompt,
        brand: "Northstar Studio",
        outputFormat: "website",
        taskType: "website",
      },
    }),
    onSuccess: setCompileResult,
  });

  const scopes = data?.scopes ?? [];
  const rules = data?.rules ?? [];
  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? rules[0] ?? null;
  const pendingRules = rules.filter((rule) => rule.status === "pending");
  const activeRules = rules.filter((rule) => rule.status === "active");
  const scopesByParent = useMemo(() => {
    const grouped = new Map<string, RuleScope[]>();
    for (const scope of scopes) {
      const key = scope.parentId ?? "root";
      grouped.set(key, [...(grouped.get(key) ?? []), scope]);
    }
    return grouped;
  }, [scopes]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="rules-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6" data-testid="rules-error">
        <div className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          Failed to load rules.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="rules-page">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6">
        <FileSliders className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Rules</h1>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span data-testid="rules-active-count">{data?.status.active ?? 0} active</span>
          <span data-testid="rules-pending-count">{data?.status.pending ?? 0} pending</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(360px,1fr)_360px]">
        <section className="min-h-0 overflow-y-auto border-r border-border p-4" data-testid="rules-scope-tree">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            Scope tree
          </div>
          <div className="space-y-2">
            {(scopesByParent.get("root") ?? []).map((scope) => (
              <div key={scope.id} className="border border-border bg-card p-3">
                <div className="text-sm font-medium text-foreground">{scope.name}</div>
                <div className="mt-1 text-[11px] uppercase text-muted-foreground">{scope.kind}</div>
                {(scopesByParent.get(scope.id) ?? []).map((child) => (
                  <div key={child.id} className="mt-3 border-l border-border pl-3">
                    <div className="text-sm text-foreground">{child.name}</div>
                    <div className="text-[11px] uppercase text-muted-foreground">{child.kind}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto p-4" data-testid="rules-inspector">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Active rules
          </div>
          <div className="space-y-2">
            {activeRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => setSelectedRuleId(rule.id)}
                className="w-full border border-border bg-card p-3 text-left hover:border-muted-foreground"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{rule.title}</span>
                  <span className="ml-auto text-[11px] uppercase text-muted-foreground">{rule.kind}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{rule.content}</p>
              </button>
            ))}
          </div>

          {selectedRule && (
            <div className="mt-5 border border-border bg-card p-4" data-testid="rules-selected">
              <div className="text-sm font-medium text-foreground">{selectedRule.title}</div>
              <div className="mt-1 text-[11px] uppercase text-muted-foreground">{selectedRule.status} · {selectedRule.kind}</div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{selectedRule.content}</p>
              {selectedRule.references.length > 0 && (
                <div className="mt-3 text-xs text-muted-foreground">
                  {selectedRule.references.map((ref) => `${ref.kind}:${ref.label ?? ref.ref}`).join(", ")}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-border p-4">
          <div className="mb-3 text-[11px] font-medium uppercase text-muted-foreground">Pending approval</div>
          <div className="space-y-2" data-testid="rules-pending-queue">
            {pendingRules.length === 0 && <div className="text-sm text-muted-foreground">No pending rules.</div>}
            {pendingRules.map((rule) => (
              <div key={rule.id} className="border border-border bg-card p-3">
                <div className="text-sm font-medium text-foreground">{rule.title}</div>
                <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{rule.content}</p>
                <Button
                  className="mt-3 h-8 w-full"
                  size="sm"
                  onClick={() => approve.mutate(rule.id)}
                  disabled={approve.isPending}
                  data-testid={`rules-approve-${rule.id}`}
                >
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Approve
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-4" data-testid="rules-compile-preview">
            <div className="mb-3 text-[11px] font-medium uppercase text-muted-foreground">Compile preview</div>
            <Textarea
              value={compilePrompt}
              onChange={(event) => setCompilePrompt(event.target.value)}
              className="min-h-24 text-sm"
              data-testid="rules-compile-input"
            />
            <Button className="mt-3 h-8 w-full" size="sm" onClick={() => compile.mutate()} disabled={compile.isPending}>
              <Play className="mr-2 h-3.5 w-3.5" />
              Compile
            </Button>
            {compileResult && (
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap border border-border bg-background p-3 text-xs text-foreground" data-testid="rules-compile-output">
                {compileResult.prompt || "No applicable rules."}
              </pre>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
