"use client";

import { useQuery } from "@tanstack/react-query";
import type { Message } from "@/lib/hub-types";

export function useMessages(channelId: string | null, opts?: { limit?: number }) {
  return useQuery<Message[]>({
    queryKey: ["hub_messages", channelId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (opts?.limit) params.set("limit", String(opts.limit));
      return fetch(`/api/channels/${channelId}/messages?${params}`).then((r) =>
        r.json(),
      );
    },
    enabled: !!channelId,
    refetchInterval: 3000,
  });
}

export function useThreadMessages(threadId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["hub_messages", "thread", threadId],
    queryFn: () =>
      fetch(`/api/messages/${threadId}/thread`).then((r) => r.json()),
    enabled: !!threadId,
    refetchInterval: 3000,
  });
}
