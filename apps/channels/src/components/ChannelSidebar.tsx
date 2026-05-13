"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Hash, Volume2, Megaphone, ChevronDown, Plus, Search, Settings } from "lucide-react";
import { useHub } from "@/context/HubContext";
import { cn } from "@/lib/utils";
import type { Space, Channel, Category } from "@/lib/hub-types";
import { DmList } from "./DmList";

function ChannelIcon({ kind }: { kind: Channel["kind"] }) {
  switch (kind) {
    case "voice":
      return <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case "announcement":
      return <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />;
    default:
      return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
}

function CategoryGroup({
  category,
  channels,
  selectedChannelId,
  onSelect,
}: {
  category: Category;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", collapsed && "-rotate-90")}
        />
        {category.name}
      </button>
      {!collapsed &&
        channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelect(ch.id)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
              selectedChannelId === ch.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <ChannelIcon kind={ch.kind} />
            <span className="truncate">{ch.name}</span>
          </button>
        ))}
    </div>
  );
}

export function ChannelSidebar() {
  const { selectedSpaceId, selectedChannelId, setSelectedChannelId } = useHub();

  const { data: space } = useQuery<Space>({
    queryKey: ["hub_spaces", selectedSpaceId],
    queryFn: () => fetch(`/api/spaces/${selectedSpaceId}`).then((r) => r.json()),
    enabled: !!selectedSpaceId,
  });

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["hub_channels", selectedSpaceId],
    queryFn: () =>
      fetch(`/api/spaces/${selectedSpaceId}/channels`).then((r) => r.json()),
    enabled: !!selectedSpaceId,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["hub_categories", selectedSpaceId],
    queryFn: () =>
      fetch(`/api/spaces/${selectedSpaceId}/channels?categories=true`).then((r) =>
        r.json(),
      ),
    enabled: !!selectedSpaceId,
  });

  // Auto-select first channel
  React.useEffect(() => {
    if (selectedSpaceId && !selectedChannelId && channels.length > 0) {
      setSelectedChannelId(channels[0].id);
    }
  }, [selectedSpaceId, selectedChannelId, channels, setSelectedChannelId]);

  if (!selectedSpaceId) {
    return (
      <div
        className="flex h-full w-60 shrink-0 flex-col border-r border-border"
        style={{ backgroundColor: "var(--sidebar-bg)" }}
      >
        <div className="flex h-12 items-center border-b border-border px-4 shadow-sm">
          <h2 className="text-sm font-semibold">Direct Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <DmList />
        </div>
      </div>
    );
  }

  // Group channels by category
  const uncategorized = channels.filter((ch) => !ch.categoryId);
  const byCategory = new Map<string, Channel[]>();
  for (const ch of channels) {
    if (!ch.categoryId) continue;
    const arr = byCategory.get(ch.categoryId) ?? [];
    arr.push(ch);
    byCategory.set(ch.categoryId, arr);
  }

  return (
    <div
      className="flex h-full w-60 shrink-0 flex-col border-r border-border"
      style={{ backgroundColor: "var(--sidebar-bg)" }}
    >
      {/* Space header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4 shadow-sm">
        <h2 className="truncate text-sm font-semibold">{space?.name ?? "..."}</h2>
        <button className="text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {categories.map((cat) => (
          <CategoryGroup
            key={cat.id}
            category={cat}
            channels={byCategory.get(cat.id) ?? []}
            selectedChannelId={selectedChannelId}
            onSelect={setSelectedChannelId}
          />
        ))}

        {uncategorized.length > 0 && (
          <div className="mb-1">
            {uncategorized.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
                  selectedChannelId === ch.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <ChannelIcon kind={ch.kind} />
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Add channel */}
        <button
          onClick={() => {
            const name = prompt("Channel name:");
            if (!name?.trim()) return;
            fetch(`/api/spaces/${selectedSpaceId}/channels`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: name.trim() }),
            });
          }}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          <span>Add Channel</span>
        </button>
      </div>
    </div>
  );
}
