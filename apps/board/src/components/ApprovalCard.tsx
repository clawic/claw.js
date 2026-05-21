"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, ShieldCheck, Loader2 } from "lucide-react";
import { invalidateCompanyQueries } from "@/lib/board-queries";
import { cn, relativeTime } from "@/lib/utils";
import type { Approval } from "@/lib/company-types";
import { Button } from "@/components/ui/button";

interface ApprovalCardProps {
  approval: Approval;
  compact?: boolean;
}

function approvalSummary(a: Approval): { title: string; subtitle?: string } {
  const payload = (a.payload ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "hire_agent":
      return {
        title: `Hire ${String(payload.title ?? payload.name ?? "agent")}`,
        subtitle: typeof payload.capabilities === "string" ? payload.capabilities : undefined,
      };
    case "fire_agent":
      return { title: `Fire ${String(payload.name ?? "agent")}` };
    case "budget_change":
      return { title: "Budget change request" };
    case "policy_change":
      return { title: "Policy change request" };
    default:
      return { title: a.type };
  }
}

export function ApprovalCard({ approval, compact = false }: ApprovalCardProps) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);

  const decide = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      const res = await fetch(`/api/approvals/${approval.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error("decide failed");
      return res.json();
    },
    onSettled: () => {
      setPending(null);
      void invalidateCompanyQueries(queryClient, approval.companyId);
    },
  });

  const { title, subtitle } = approvalSummary(approval);

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3",
        compact ? "py-2" : "py-3",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <ShieldCheck
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            approval.status === "pending"
              ? "text-amber-500"
              : approval.status === "approved"
              ? "text-green-500"
              : "text-red-500",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{subtitle}</p>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">
            {relativeTime(approval.createdAt)} · {approval.status}
          </div>
        </div>
      </div>
      {approval.status === "pending" && (
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-green-500 hover:bg-green-500/10 hover:text-green-400"
            disabled={decide.isPending}
            onClick={() => {
              setPending("approved");
              decide.mutate("approved");
            }}
          >
            {pending === "approved" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-red-500 hover:bg-red-500/10 hover:text-red-400"
            disabled={decide.isPending}
            onClick={() => {
              setPending("rejected");
              decide.mutate("rejected");
            }}
          >
            {pending === "rejected" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
