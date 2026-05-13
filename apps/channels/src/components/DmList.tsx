"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useHub } from "@/context/HubContext";
import { cn } from "@/lib/utils";
import { PresenceIndicator } from "./PresenceIndicator";
import type { Channel } from "@/lib/hub-types";

export function DmList() {
  const { selectedChannelId, setSelectedChannelId } = useHub();

  const { data: dmChannels = [] } = useQuery<Channel[]>({
    queryKey: ["hub_channels", "dm"],
    queryFn: () => fetch("/api/dm").then((r) => r.json()),
  });

  if (dmChannels.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
        No direct messages yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {dmChannels.map((ch) => (
        <button
          key={ch.id}
          onClick={() => setSelectedChannelId(ch.id)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
            selectedChannelId === ch.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium">
              {ch.name.slice(0, 2).toUpperCase()}
            </div>
            <PresenceIndicator
              status="offline"
              className="absolute -bottom-0.5 -right-0.5"
            />
          </div>
          <span className="truncate">{ch.name}</span>
        </button>
      ))}
    </div>
  );
}
