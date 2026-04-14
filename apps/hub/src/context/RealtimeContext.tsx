"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RealtimeClient, type RealtimeEvent } from "@/lib/realtime";

const HUB_COLLECTIONS = [
  "hub_messages",
  "hub_members",
  "hub_reactions",
  "hub_read_states",
  "hub_notifications",
  "hub_channels",
  "hub_spaces",
];

const RealtimeContext = React.createContext<RealtimeClient | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const clientRef = React.useRef<RealtimeClient | null>(null);

  React.useEffect(() => {
    const client = new RealtimeClient();
    clientRef.current = client;

    for (const collection of HUB_COLLECTIONS) {
      client.subscribe(collection);
    }

    client.onAny((event: RealtimeEvent) => {
      const key = event.collectionName;
      queryClient.invalidateQueries({ queryKey: [key] });

      if (key === "hub_messages") {
        queryClient.invalidateQueries({ queryKey: ["hub_channels"] });
      }
    });

    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [queryClient]);

  return (
    <RealtimeContext value={clientRef.current}>{children}</RealtimeContext>
  );
}

export function useRealtime(): RealtimeClient | null {
  return React.useContext(RealtimeContext);
}
