"use client";

/**
 * Compact one-line issue row used in Inbox, Issues list, and Dashboard
 * recent-issues widget.
 */

import { Link } from "@/lib/router";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { cn, relativeTime } from "@/lib/utils";
import type { CompanyAgent, Issue } from "@/lib/company-types";

interface IssueRowProps {
  issue: Issue;
  href: string;
  assignee?: CompanyAgent | null;
  /** Render in a dense one-line style (for Inbox). */
  dense?: boolean;
  /** Optional project name to show as a pill. */
  projectName?: string;
}

export function IssueRow({ issue, href, assignee, dense = false, projectName }: IssueRowProps) {
  return (
    <Link
      to={href}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
        "hover:bg-accent/40",
        dense ? "min-h-9" : "min-h-10",
      )}
    >
      <StatusIcon status={issue.status} />
      <PriorityIcon priority={issue.priority} />
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-16 truncate">
        {issue.identifier}
      </span>
      <span className="flex-1 truncate text-sm text-foreground group-hover:text-foreground">
        {issue.title}
      </span>
      {projectName && (
        <span className="hidden md:inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {projectName}
        </span>
      )}
      {assignee ? (
        <Identity name={assignee.title} size="xs" />
      ) : (
        <span className="text-[11px] text-muted-foreground italic">unassigned</span>
      )}
      <span className="hidden lg:inline text-[11px] text-muted-foreground w-20 text-right">
        {relativeTime(issue.updatedAt)}
      </span>
    </Link>
  );
}
