"use client";

import { useQuery } from "@tanstack/react-query";
import { useRealtimeHealth } from "@/context/RealtimeContext";
import type { Message } from "@/lib/hub-types";

export function useMessages(channelId: string | null, opts?: { limit?: number }) {
  const realtimeHealthy = useRealtimeHealth();

  return useQuery<Message[]>({
    queryKey: ["hub_messages", channelId, opts?.limit ?? null],
    queryFn: () => {
      if (!channelId) return Promise.resolve([]);
      const params = new URLSearchParams();
      if (opts?.limit) params.set("limit", String(opts.limit));
      return fetch(`/api/channels/${channelId}/messages?${params}`).then((r) =>
        r.json(),
      );
    },
    enabled: !!channelId,
    refetchInterval: realtimeHealthy ? false : 3000,
  });
}

export function useThreadMessages(threadId: string | null) {
  const realtimeHealthy = useRealtimeHealth();

  return useQuery<Message[]>({
    queryKey: ["hub_messages", "thread", threadId],
    queryFn: () => {
      if (!threadId) return Promise.resolve([]);
      return fetch(`/api/messages/${threadId}/thread`).then((r) => r.json());
    },
    enabled: !!threadId,
    refetchInterval: realtimeHealthy ? false : 3000,
  });
}
