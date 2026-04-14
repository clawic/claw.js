"use client";

import * as React from "react";
import { SpaceRail } from "./SpaceRail";
import { ChannelSidebar } from "./ChannelSidebar";
import { MemberSidebar } from "./MemberSidebar";
import { ThreadPanel } from "./ThreadPanel";
import { useHub } from "@/context/HubContext";

export function HubLayout({ children }: { children: React.ReactNode }) {
  const { threadMessageId } = useHub();

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-background text-foreground">
      <SpaceRail />
      <ChannelSidebar />
      <div className="flex h-full min-h-0 flex-1 flex-col" style={{ backgroundColor: "var(--chat-bg)" }}>
        {children}
      </div>
      {threadMessageId ? <ThreadPanel /> : <MemberSidebar />}
    </div>
  );
}
