"use client";

import * as React from "react";

interface HubState {
  currentAgentId: string;
  currentAgentKind: "agent" | "human";
  selectedSpaceId: string | null;
  selectedChannelId: string | null;
  threadMessageId: string | null;
  setSelectedSpaceId: (id: string | null) => void;
  setSelectedChannelId: (id: string | null) => void;
  setThreadMessageId: (id: string | null) => void;
}

const HubContext = React.createContext<HubState | null>(null);

const STORAGE_KEY_SPACE = "clawjs-hub.selectedSpaceId";
const STORAGE_KEY_CHANNEL = "clawjs-hub.selectedChannelId";

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [selectedSpaceId, setSelectedSpaceId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY_SPACE);
  });

  const [selectedChannelId, setSelectedChannelId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY_CHANNEL);
  });

  const [threadMessageId, setThreadMessageId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (selectedSpaceId) localStorage.setItem(STORAGE_KEY_SPACE, selectedSpaceId);
    else localStorage.removeItem(STORAGE_KEY_SPACE);
  }, [selectedSpaceId]);

  React.useEffect(() => {
    if (selectedChannelId) localStorage.setItem(STORAGE_KEY_CHANNEL, selectedChannelId);
    else localStorage.removeItem(STORAGE_KEY_CHANNEL);
  }, [selectedChannelId]);

  const value: HubState = React.useMemo(
    () => ({
      currentAgentId: "local-user",
      currentAgentKind: "human" as const,
      selectedSpaceId,
      selectedChannelId,
      threadMessageId,
      setSelectedSpaceId,
      setSelectedChannelId,
      setThreadMessageId,
    }),
    [selectedSpaceId, selectedChannelId, threadMessageId],
  );

  return <HubContext value={value}>{children}</HubContext>;
}

export function useHub(): HubState {
  const ctx = React.useContext(HubContext);
  if (!ctx) throw new Error("useHub must be used within HubProvider");
  return ctx;
}
