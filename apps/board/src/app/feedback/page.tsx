"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquareText,
  Filter,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { boardQueryKeys, fetchCompanyFixtures } from "@/lib/board-queries";
import { relativeTime } from "@/lib/utils";
import type {
  FeedbackQueue,
  AvailableAction,
  FeedbackItem,
} from "@/lib/company-types";

interface FixturesPayload {
  feedbackQueue: FeedbackQueue;
}

type FeedbackRowItem = FeedbackItem & { availableActions: AvailableAction[] };

function FeedbackActions({ actions }: { actions: AvailableAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex gap-1">
      {actions.includes("triage") && (
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">Triage</Button>
      )}
      {actions.includes("create_issue") && (
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">Create issue</Button>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Feedback" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: boardQueryKeys.companyFixtures(selectedCompanyId),
    queryFn: () => fetchCompanyFixtures<FixturesPayload>(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const queue = data?.feedbackQueue;
  const items = (queue?.items ?? []) as FeedbackRowItem[];

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (sourceFilter !== "all" && item.sourceType !== sourceFilter) return false;
      if (sentimentFilter !== "all" && item.sentiment !== sentimentFilter) return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !item.body.toLowerCase().includes(q) &&
          !(item.customerName ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [items, statusFilter, sourceFilter, sentimentFilter, priorityFilter, search]);

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="feedback-error">
          <p className="text-sm text-red-300">Failed to load feedback data.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-medium text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="feedback-page">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-medium text-foreground">Feedback</h1>
          {queue && (
            <span className="text-[11px] text-muted-foreground">
              ({queue.counts.new} new, {queue.counts.triaged} triaged, {queue.counts.planned} planned)
            </span>
          )}
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2" data-testid="feedback-filters">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by title, body, or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs"
          data-testid="feedback-search"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="feedback-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="triaged">Triaged</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="feedback-filter-source">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="interview">Interview</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="ops">Ops</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="import">Import</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="feedback-filter-sentiment">
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sentiments</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 w-28 text-xs" data-testid="feedback-filter-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Feedback table */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <EmptyState icon={MessageSquareText} message="No feedback items match your filters." />
        ) : (
          <div className="rounded-lg border border-border bg-card/30 overflow-x-auto" data-testid="feedback-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Source</th>
                  <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Type</th>
                  <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Sentiment</th>
                  <th className="px-3 py-2 text-left font-medium">Priority</th>
                  <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Received</th>
                  <th className="px-3 py-2 text-left font-medium hidden xl:table-cell">Linked issue</th>
                  <th className="px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((fb) => (
                  <tr key={fb.id} className="border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors" data-testid={`feedback-row-${fb.id}`}>
                    <td className="px-3 py-2">
                      <span className="text-foreground font-medium truncate block max-w-xs">{fb.title}</span>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-[11px] text-muted-foreground">{fb.sourceLabel ?? "-"}</td>
                    <td className="px-3 py-2 hidden md:table-cell"><StatusBadge status={fb.sourceType} /></td>
                    <td className="px-3 py-2 hidden lg:table-cell">{fb.sentiment ? <StatusBadge status={fb.sentiment} /> : <span className="text-[11px] text-muted-foreground">-</span>}</td>
                    <td className="px-3 py-2"><StatusBadge status={fb.priority} /></td>
                    <td className="px-3 py-2 hidden lg:table-cell text-[10px] text-muted-foreground">{relativeTime(fb.receivedAt)}</td>
                    <td className="px-3 py-2 hidden xl:table-cell text-[11px] text-muted-foreground">{fb.linkedIssueId ?? "-"}</td>
                    <td className="px-3 py-2"><FeedbackActions actions={fb.availableActions} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
