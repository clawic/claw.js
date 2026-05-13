"use client";

import * as React from "react";
import { MessageSquare, SmilePlus, MoreHorizontal, Pencil, Trash2, Reply } from "lucide-react";
import { useHub } from "@/context/HubContext";
import { cn, formatTime, initials } from "@/lib/utils";
import type { Message } from "@/lib/hub-types";

interface MessageItemProps {
  message: Message;
  isGrouped?: boolean;
  onReply?: (message: Message) => void;
}

export function MessageItem({ message, isGrouped, onReply }: MessageItemProps) {
  const { setThreadMessageId, currentAgentId } = useHub();
  const [hovered, setHovered] = React.useState(false);
  const isOwn = message.authorId === currentAgentId;

  if (message.contentType === "system") {
    return (
      <div className="flex items-center gap-2 px-4 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{message.content}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex gap-4 px-4 hover:bg-muted/30",
        isGrouped ? "py-0.5" : "mt-4 pt-1 pb-0.5",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar or spacer */}
      <div className="w-10 shrink-0">
        {!isGrouped && (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold",
              message.authorKind === "agent"
                ? "bg-primary/20 text-primary"
                : "bg-success/20 text-success",
            )}
          >
            {initials(message.authorId)}
          </div>
        )}
        {isGrouped && hovered && (
          <span className="flex h-full items-center justify-end text-[10px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {!isGrouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">
              {message.authorId}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatTime(message.createdAt)}
            </span>
            {message.authorKind === "agent" && (
              <span className="rounded bg-primary/20 px-1 py-px text-[10px] font-medium text-primary">
                AGENT
              </span>
            )}
          </div>
        )}
        <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
          {message.content}
        </div>
        {message.editedAt && (
          <span className="text-[10px] text-muted-foreground">(edited)</span>
        )}
      </div>

      {/* Action buttons on hover */}
      {hovered && (
        <div className="absolute -top-3 right-4 flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm">
          <button
            onClick={() => onReply?.(message)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Reply"
          >
            <Reply className="h-4 w-4" />
          </button>
          <button
            onClick={() => setThreadMessageId(message.id)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Thread"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="React"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
          {isOwn && (
            <>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  fetch(`/api/messages/${message.id}`, { method: "DELETE" });
                }}
                className="rounded p-1 text-muted-foreground hover:bg-danger hover:text-white"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
