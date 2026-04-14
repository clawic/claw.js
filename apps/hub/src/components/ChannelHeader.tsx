"use client";

import { Hash, Users, Bell, Pin, Search } from "lucide-react";
import type { Channel } from "@/lib/hub-types";

export function ChannelHeader({ channel }: { channel: Channel | null }) {
  if (!channel) return null;

  return (
    <div className="flex h-12 items-center justify-between border-b border-border px-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Hash className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{channel.name}</h2>
        {channel.topic && (
          <>
            <div className="h-5 w-px bg-border" />
            <p className="truncate text-xs text-muted-foreground">{channel.topic}</p>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="text-muted-foreground hover:text-foreground">
          <Pin className="h-4 w-4" />
        </button>
        <button className="text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
        </button>
        <button className="text-muted-foreground hover:text-foreground">
          <Users className="h-4 w-4" />
        </button>
        <button className="text-muted-foreground hover:text-foreground">
          <Search className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
