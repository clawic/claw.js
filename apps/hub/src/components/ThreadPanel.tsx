"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useHub } from "@/context/HubContext";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { isSameDay, formatDate } from "@/lib/utils";
import type { Message } from "@/lib/hub-types";

function shouldGroup(prev: Message | undefined, curr: Message): boolean {
  if (!prev) return false;
  if (prev.authorId !== curr.authorId) return false;
  const diff =
    new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return diff < 5 * 60 * 1000;
}

export function ThreadPanel() {
  const { threadMessageId, setThreadMessageId, selectedChannelId } = useHub();
  const endRef = React.useRef<HTMLDivElement>(null);

  const { data: parentMessage } = useQuery<Message>({
    queryKey: ["hub_messages", "detail", threadMessageId],
    queryFn: () =>
      fetch(`/api/messages/${threadMessageId}`).then((r) => r.json()),
    enabled: !!threadMessageId,
  });

  const { data: replies = [] } = useQuery<Message[]>({
    queryKey: ["hub_messages", "thread", threadMessageId],
    queryFn: () =>
      fetch(`/api/messages/${threadMessageId}/thread`).then((r) => r.json()),
    enabled: !!threadMessageId,
    refetchInterval: 3000,
  });

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  if (!threadMessageId) return null;

  return (
    <div
      className="flex h-full w-96 shrink-0 flex-col border-l border-border"
      style={{ backgroundColor: "var(--sidebar-bg)" }}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4 shadow-sm">
        <h3 className="text-sm font-semibold">Thread</h3>
        <button
          onClick={() => setThreadMessageId(null)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {parentMessage && (
          <div className="border-b border-border pb-2">
            <MessageItem message={parentMessage} />
          </div>
        )}

        <div className="my-2 flex items-center gap-2 px-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] text-muted-foreground">
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {replies.map((msg, i) => {
          const prev = replies[i - 1];
          const grouped = shouldGroup(prev, msg);
          return <MessageItem key={msg.id} message={msg} isGrouped={grouped} />;
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      {selectedChannelId && threadMessageId && (
        <MessageInput
          channelId={selectedChannelId}
          threadId={threadMessageId}
        />
      )}
    </div>
  );
}
