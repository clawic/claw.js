"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bot, Loader2, Play, Send, User } from "lucide-react";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { Identity } from "@/components/Identity";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePropertiesPanel } from "@/components/PropertiesPanel";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { invalidateCompanyQueries, useCompanyDetailQuery } from "@/lib/board-queries";
import { cn, relativeTime } from "@/lib/utils";
import type {
  CompanyAgent,
  Issue,
  IssueComment,
  IssuePriority,
  IssueStatus,
} from "@/lib/company-types";

interface IssueDetailPayload {
  issue: Issue;
  comments: IssueComment[];
}

const BOTTOM_STICKY_PX = 48;
const EMPTY_AGENTS: CompanyAgent[] = [];

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_STICKY_PX;
}

export default function IssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = use(params);
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [reply, setReply] = useState("");
  const [streamBuffer, setStreamBuffer] = useState("");
  const [running, setRunning] = useState(false);
  const mainScroll = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef("");
  const streamRafRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);

  const cancelStreamCommit = () => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
  };

  const flushStreamCommit = () => {
    cancelStreamCommit();
    setStreamBuffer(streamBufferRef.current);
  };

  const scheduleStreamCommit = () => {
    if (streamRafRef.current != null) return;
    streamRafRef.current = requestAnimationFrame(() => {
      streamRafRef.current = null;
      setStreamBuffer(streamBufferRef.current);
    });
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["issue", issueId],
    queryFn: async (): Promise<IssueDetailPayload> => {
      const res = await fetch(`/api/issues/${issueId}`);
      if (!res.ok) throw new Error("load failed");
      return res.json();
    },
  });

  const { data: companyDetail } = useCompanyDetailQuery(selectedCompanyId);

  const agents = companyDetail?.agents ?? EMPTY_AGENTS;
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  useEffect(() => {
    if (data?.issue) {
      setBreadcrumbs([
        { label: "Issues", to: "/issues" },
        { label: `${data.issue.identifier}: ${data.issue.title}` },
      ]);
    }
  }, [data?.issue, setBreadcrumbs]);

  useEffect(() => {
    if (!stickToBottomRef.current || !mainScroll.current) return;
    requestAnimationFrame(() => {
      if (stickToBottomRef.current && mainScroll.current) {
        mainScroll.current.scrollTop = mainScroll.current.scrollHeight;
      }
    });
  }, [streamBuffer, data?.comments?.length]);

  useEffect(() => {
    return () => cancelStreamCommit();
  }, []);

  // ── Mutations ──
  const updateIssue = useMutation({
    mutationFn: async (patch: Partial<Issue>): Promise<Issue> => {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
      void invalidateCompanyQueries(queryClient, selectedCompanyId);
    },
  });

  const postComment = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/issues/${issueId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("comment failed");
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      stickToBottomRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
    },
  });

  const runWithAgent = useCallback(async () => {
    if (running) return;
    setRunning(true);
    streamBufferRef.current = "";
    setStreamBuffer("");
    stickToBottomRef.current = true;
    try {
      const res = await fetch(`/api/issues/${issueId}/run`, { method: "POST" });
      if (!res.body) throw new Error("no stream body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.startsWith("data: ") ? frame.slice(6) : frame;
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            if (typeof payload.delta === "string") {
              streamBufferRef.current += payload.delta;
              scheduleStreamCommit();
            }
            if (payload.done) {
              flushStreamCommit();
              await refetch();
              streamBufferRef.current = "";
              setStreamBuffer("");
            }
          } catch {
            // ignore
          }
        }
      }
    } finally {
      setRunning(false);
    }
  }, [issueId, refetch, running]);

  // ── Right panel (IssueProperties) ──
  const propertiesContent = useMemo(() => {
    if (!data?.issue) return null;
    const issue = data.issue;
    const assignee = issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null;
    return (
      <div className="space-y-4 text-[12px]">
        <Field label="Status">
          <Select
            value={issue.status}
            onValueChange={(v) => updateIssue.mutate({ status: v as IssueStatus })}
          >
            <SelectTrigger className="h-8">
              <SelectValue>
                <span className="inline-flex items-center gap-2">
                  <StatusIcon status={issue.status} /> {labelize(issue.status)}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["todo", "in_progress", "blocked", "in_review", "done", "cancelled"] as IssueStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="inline-flex items-center gap-2">
                    <StatusIcon status={s} /> {labelize(s)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={issue.priority}
            onValueChange={(v) => updateIssue.mutate({ priority: v as IssuePriority })}
          >
            <SelectTrigger className="h-8">
              <SelectValue>
                <span className="inline-flex items-center gap-2">
                  <PriorityIcon priority={issue.priority} /> {labelize(issue.priority)}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["low", "medium", "high", "urgent"] as IssuePriority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="inline-flex items-center gap-2">
                    <PriorityIcon priority={p} /> {labelize(p)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Assignee">
          <Select
            value={issue.assigneeAgentId || "unassigned"}
            onValueChange={(v) =>
              updateIssue.mutate({ assigneeAgentId: v === "unassigned" ? undefined : v })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue>
                {assignee ? (
                  <Identity name={assignee.title} size="xs" />
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Separator />
        <Field label="Identifier">
          <div className="font-mono text-[11px] text-muted-foreground">{issue.identifier}</div>
        </Field>
        <Field label="Created">
          <div className="text-[11px] text-muted-foreground">{relativeTime(issue.createdAt)}</div>
        </Field>
        <Field label="Updated">
          <div className="text-[11px] text-muted-foreground">{relativeTime(issue.updatedAt)}</div>
        </Field>
      </div>
    );
  }, [data?.issue, agents, agentById]);

  usePropertiesPanel(
    propertiesContent ? { title: "Properties", content: propertiesContent } : null,
  );

  if (isLoading || !data) return <PageSkeleton />;

  const issue = data.issue;
  const assignee = issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null;
  const canRun = assignee?.adapterType === "clawjs_local" && assignee.status === "active";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <StatusIcon status={issue.status} />
          <PriorityIcon priority={issue.priority} />
          <span className="font-mono text-[11px] text-muted-foreground">{issue.identifier}</span>
          <h1 className="flex-1 truncate text-base font-medium text-foreground">{issue.title}</h1>
          <StatusBadge status={issue.status} />
        </div>
        {assignee && (
          <div className="mt-1 ml-8 text-[11px] text-muted-foreground">
            Assigned to <span className="text-foreground">{assignee.title}</span>
          </div>
        )}
      </header>

      <main
        ref={mainScroll}
        onScroll={(event) => {
          stickToBottomRef.current = isNearBottom(event.currentTarget);
        }}
        className="flex-1 min-h-0 overflow-y-auto px-6 py-6"
      >
        {issue.description && (
          <section className="mb-6 rounded-lg border border-border bg-card/50 p-4">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </div>
            <div className="whitespace-pre-wrap text-[13px] text-foreground">{issue.description}</div>
          </section>
        )}

        <section>
          {data.comments.length === 0 && !streamBuffer && (
            <EmptyState
              icon={Bot}
              message={
                canRun
                  ? "No comments yet. Press Run to have the agent take a first pass."
                  : "No comments yet."
              }
            />
          )}
          {(data.comments.length > 0 || streamBuffer) && (
            <VirtualizedIssueComments
              comments={data.comments}
              streamBuffer={streamBuffer}
              streamAuthor={assignee?.title ?? "Agent"}
              agentById={agentById}
              scrollerRef={mainScroll}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-border px-6 py-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Add a comment as the board…"
            rows={2}
            className="flex-1"
          />
          <Button
            type="button"
            disabled={!reply.trim() || postComment.isPending}
            onClick={() => postComment.mutate(reply)}
          >
            {postComment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Send
          </Button>
          {canRun && (
            <Button
              type="button"
              disabled={running}
              onClick={runWithAgent}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run with {assignee?.title}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function labelize(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type IssueCommentListItem =
  | { kind: "comment"; comment: IssueComment }
  | { kind: "stream"; body: string; author: string };

function VirtualizedIssueComments({
  comments,
  streamBuffer,
  streamAuthor,
  agentById,
  scrollerRef,
}: {
  comments: IssueComment[];
  streamBuffer: string;
  streamAuthor: string;
  agentById: Map<string, CompanyAgent>;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const items = useMemo<IssueCommentListItem[]>(
    () => [
      ...comments.map((comment) => ({ kind: "comment" as const, comment })),
      ...(streamBuffer ? [{ kind: "stream" as const, body: streamBuffer, author: streamAuthor }] : []),
    ],
    [comments, streamBuffer, streamAuthor],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 108,
    getItemKey: (index) => {
      const item = items[index];
      return item?.kind === "comment" ? item.comment.id : "stream-buffer";
    },
    overscan: 8,
  });

  return (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index];
        if (!item) return null;
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-testid="board-comment-row"
            className="absolute left-0 top-0 w-full pb-3"
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            {item.kind === "comment" ? (
              <CommentCard
                comment={item.comment}
                agent={item.comment.authorAgentId ? agentById.get(item.comment.authorAgentId) : null}
              />
            ) : (
              <StreamingCommentCard body={item.body} author={item.author} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StreamingCommentCard({ body, author }: { body: string; author: string }) {
  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
      <div className="mb-1 flex items-center gap-2 text-[10px] text-amber-400">
        <Bot className="h-3 w-3" />
        <Loader2 className="h-3 w-3 animate-spin" />
        {author} is thinking…
      </div>
      <div className="whitespace-pre-wrap text-[13px] text-foreground">{body}</div>
    </div>
  );
}

function CommentCard({
  comment,
  agent,
}: {
  comment: IssueComment;
  agent: CompanyAgent | null | undefined;
}) {
  const isAgent = Boolean(agent);
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        isAgent && "border-blue-500/20 bg-blue-500/[0.02]",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        {isAgent ? <Bot className="h-3 w-3 text-blue-400" /> : <User className="h-3 w-3" />}
        <span className="text-foreground/80">{agent?.title ?? "Board"}</span>
        <span>·</span>
        <span>{relativeTime(comment.createdAt)}</span>
      </div>
      <div className="whitespace-pre-wrap text-[13px] text-foreground">{comment.body}</div>
    </div>
  );
}
