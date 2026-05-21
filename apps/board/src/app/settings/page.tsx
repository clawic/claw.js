"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Upload,
  FileText,
  Plus,
  Loader2,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { boardQueryKeys, fetchCompanyImports, invalidateCompanyData } from "@/lib/board-queries";
import { relativeTime, formatDateTime } from "@/lib/utils";
import type { ImportBatch } from "@/lib/company-types";

const SUPPORTED_TYPES = [
  { value: "feedback", label: "Feedback", description: "Import customer feedback, reviews, and support signals." },
  { value: "metrics", label: "Metrics", description: "Import metric snapshots with key, label, value, and direction." },
  { value: "checks", label: "Checks", description: "Import operational health checks with status and severity." },
  { value: "incidents", label: "Incidents", description: "Import incident records with severity and resolution." },
  { value: "mixed", label: "Mixed", description: "Mixed payload. Items are routed by their fields." },
];

const SAMPLE_PAYLOAD = `{
  "type": "feedback",
  "sourceLabel": "App Store Reviews",
  "items": [
    {
      "title": "Great product but slow checkout",
      "body": "Love the app, but checkout takes too long on mobile.",
      "sourceType": "review",
      "priority": "high",
      "sentiment": "mixed"
    }
  ]
}`;

export default function SettingsPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState("feedback");
  const [importSource, setImportSource] = useState("");
  const [importPayload, setImportPayload] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Settings" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: boardQueryKeys.companyImports(selectedCompanyId),
    queryFn: () => fetchCompanyImports(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createImport = useMutation({
    mutationFn: async () => {
      let items: Array<Record<string, unknown>> = [];
      if (importPayload.trim()) {
        try {
          const parsed = JSON.parse(importPayload);
          items = Array.isArray(parsed) ? parsed : (parsed.items ?? [parsed]);
        } catch {
          throw new Error("Invalid JSON payload");
        }
      }
      const res = await fetch(`/api/companies/${selectedCompanyId}/metrics/imports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: importType,
          sourceLabel: importSource || undefined,
          items,
        }),
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: () => {
      setImportOpen(false);
      setImportPayload("");
      setImportSource("");
      void invalidateCompanyData(queryClient, selectedCompanyId);
    },
  });

  const imports = data?.imports ?? [];
  const sortedImports = [...imports].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="settings-error">
          <p className="text-sm text-red-300">Failed to load settings data.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="settings-page">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium text-foreground">Settings & Imports</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8">
        {/* Organization info */}
        {selectedCompany && (
          <section data-testid="settings-org-info">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Organization
            </h2>
            <div className="rounded-lg border border-border bg-card p-4 max-w-lg">
              <div className="text-sm font-medium text-foreground">{selectedCompany.name}</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                Prefix: {selectedCompany.issuePrefix}
              </div>
              {selectedCompany.description && (
                <p className="mt-2 text-[12px] text-muted-foreground">{selectedCompany.description}</p>
              )}
            </div>
          </section>
        )}

        {/* Import history */}
        <section data-testid="settings-imports">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Import history ({imports.length})
            </h2>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="new-import-cta">
                  <Plus className="h-3 w-3" /> New import
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg" data-testid="new-import-dialog">
                <DialogHeader>
                  <DialogTitle>New import</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Type</Label>
                    <Select value={importType} onValueChange={setImportType}>
                      <SelectTrigger className="mt-1" data-testid="import-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Source label (optional)</Label>
                    <Input
                      className="mt-1"
                      placeholder="e.g. App Store Reviews"
                      value={importSource}
                      onChange={(e) => setImportSource(e.target.value)}
                      data-testid="import-source-input"
                    />
                  </div>
                  <div>
                    <Label>Payload (JSON array of items)</Label>
                    <textarea
                      className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm font-mono min-h-[120px] focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={SAMPLE_PAYLOAD}
                      value={importPayload}
                      onChange={(e) => setImportPayload(e.target.value)}
                      data-testid="import-payload-input"
                    />
                  </div>
                  {createImport.isError && (
                    <p className="text-sm text-red-400">{(createImport.error as Error).message}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">Cancel</Button>
                    </DialogClose>
                    <Button
                      size="sm"
                      disabled={createImport.isPending}
                      onClick={() => createImport.mutate()}
                      data-testid="import-submit"
                    >
                      {createImport.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                      Import
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {sortedImports.length === 0 ? (
            <EmptyState icon={Upload} message="No imports yet." action="New import" onAction={() => setImportOpen(true)} />
          ) : (
            <div className="rounded-lg border border-border bg-card/30 overflow-x-auto" data-testid="imports-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Source</th>
                    <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Started</th>
                    <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Finished</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Created by</th>
                    <th className="px-3 py-2 text-left font-medium hidden xl:table-cell">Counts</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedImports.map((imp) => (
                    <tr key={imp.id} className="border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors" data-testid={`import-row-${imp.id}`}>
                      <td className="px-3 py-2"><StatusBadge status={imp.type} /></td>
                      <td className="px-3 py-2"><StatusBadge status={imp.status} /></td>
                      <td className="px-3 py-2 hidden md:table-cell text-[11px] text-muted-foreground">{imp.sourceLabel ?? "-"}</td>
                      <td className="px-3 py-2 hidden lg:table-cell text-[10px] text-muted-foreground">{relativeTime(imp.startedAt)}</td>
                      <td className="px-3 py-2 hidden lg:table-cell text-[10px] text-muted-foreground">{imp.finishedAt ? relativeTime(imp.finishedAt) : "-"}</td>
                      <td className="px-3 py-2 hidden md:table-cell text-[11px] text-muted-foreground">{imp.createdByUserId ?? "-"}</td>
                      <td className="px-3 py-2 hidden xl:table-cell text-[10px] text-muted-foreground font-mono">
                        {imp.counts ? Object.entries(imp.counts).map(([k, v]) => `${k}: ${v}`).join(", ") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Supported import types */}
        <section data-testid="settings-supported-types">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Supported import types
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {SUPPORTED_TYPES.map((t) => (
              <div key={t.value} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{t.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{t.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sample payload help */}
        <section data-testid="settings-sample-payload">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Sample payload
          </h2>
          <pre className="rounded-lg border border-border bg-card p-4 text-[11px] text-muted-foreground overflow-x-auto">
            {SAMPLE_PAYLOAD}
          </pre>
        </section>
      </div>
    </div>
  );
}
