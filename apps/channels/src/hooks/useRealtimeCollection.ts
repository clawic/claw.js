"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "@/context/RealtimeContext";

export function useRealtimeCollection(collectionName: string) {
  const client = useRealtime();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!client) return;

    const unsub = client.on(collectionName, () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    });

    return unsub;
  }, [client, collectionName, queryClient]);
}
