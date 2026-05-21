"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChannelHeader } from "./ChannelHeader";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { useHub } from "@/context/HubContext";
import { useMessages } from "@/hooks/useMessages";
import { isSameDay, formatDate } from "@/lib/utils";
import type { Channel, Message } from "@/lib/hub-types";

function shouldGroup(prev: Message | undefined, curr: Message): boolean {
  if (!prev) return false;
  if (prev.authorId !== curr.authorId) return false;
  if (prev.authorKind !== curr.authorKind) return false;
  const diff =
    new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return diff < 5 * 60 * 1000; // 5 minutes
}

function DateDivider({ date }: { date: string }) {
  return (
    <div className="my-4 flex items-center gap-2 px-4">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold text-muted-foreground">
        {formatDate(date)}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function ChatArea() {
  const { selectedChannelId } = useHub();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const { data: channel } = useQuery<Channel>({
    queryKey: ["hub_channels", "detail", selectedChannelId],
    queryFn: () =>
      fetch(`/api/channels/${selectedChannelId}`).then((r) => r.json()),
    enabled: !!selectedChannelId,
  });

  const { data: messages = [] } = useMessages(selectedChannelId);

  // Only show top-level messages (no thread replies)
  const topLevel = messages.filter((m) => !m.threadId);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [topLevel.length]);

  if (!selectedChannelId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-muted-foreground">
            Select a channel
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a channel from the sidebar to start chatting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChannelHeader channel={channel ?? null} />
      <div className="flex-1 overflow-y-auto">
        {/* Welcome message */}
        {topLevel.length === 0 && channel && (
          <div className="px-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <span className="text-2xl font-bold text-muted-foreground">#</span>
            </div>
            <h3 className="mt-2 text-2xl font-bold">Welcome to #{channel.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This is the start of the #{channel.name} channel.
              {channel.topic ? ` ${channel.topic}` : ""}
            </p>
          </div>
        )}

        {topLevel.map((msg, i) => {
          const prev = topLevel[i - 1];
          const showDate =
            !prev || !isSameDay(prev.createdAt, msg.createdAt);
          const grouped = !showDate && shouldGroup(prev, msg);

          return (
            <React.Fragment key={msg.id}>
              {showDate && <DateDivider date={msg.createdAt} />}
              <MessageItem message={msg} isGrouped={grouped} />
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <MessageInput
        channelId={selectedChannelId}
        channelName={channel?.name}
      />
    </>
  );
}
