"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  RealtimeClient,
  type RealtimeEvent,
  type RealtimeStatus,
} from "@/lib/realtime";

const HUB_COLLECTIONS = [
  "hub_categories",
  "hub_channels",
  "hub_dm_participants",
  "hub_members",
  "hub_messages",
  "hub_notifications",
  "hub_reactions",
  "hub_read_states",
  "hub_roles",
  "hub_spaces",
] as const;

interface RealtimeContextValue {
  client: RealtimeClient;
  status: RealtimeStatus;
  isHealthy: boolean;
}

const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = React.useState(() => new RealtimeClient());
  const [status, setStatus] = React.useState<RealtimeStatus>(() =>
    client.snapshotStatus(),
  );
  const wasHealthyRef = React.useRef(false);

  React.useEffect(() => {
    for (const collection of HUB_COLLECTIONS) {
      client.subscribe(collection);
    }

    const unsubscribeEvents = client.onAny((event: RealtimeEvent) => {
      invalidateCollection(queryClient, event.collectionName);
    });

    const unsubscribeStatus = client.onStatus((next) => {
      setStatus(next);

      if (next.isHealthy && !wasHealthyRef.current) {
        for (const collection of HUB_COLLECTIONS) {
          invalidateCollection(queryClient, collection);
        }
      }
      wasHealthyRef.current = next.isHealthy;
    });

    client.connect();

    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
      client.disconnect();
    };
  }, [client, queryClient]);

  const value = React.useMemo<RealtimeContextValue>(
    () => ({
      client,
      status,
      isHealthy: status.isHealthy,
    }),
    [client, status],
  );

  return (
    <RealtimeContext value={value}>{children}</RealtimeContext>
  );
}

export function useRealtime(): RealtimeClient | null {
  return React.useContext(RealtimeContext)?.client ?? null;
}

export function useRealtimeStatus(): RealtimeStatus | null {
  return React.useContext(RealtimeContext)?.status ?? null;
}

export function useRealtimeHealth(): boolean {
  return React.useContext(RealtimeContext)?.isHealthy ?? false;
}

function invalidateCollection(
  queryClient: ReturnType<typeof useQueryClient>,
  collectionName: string,
): void {
  queryClient.invalidateQueries({ queryKey: [collectionName] });

  if (collectionName === "hub_messages") {
    queryClient.invalidateQueries({ queryKey: ["hub_channels"] });
  }
}
