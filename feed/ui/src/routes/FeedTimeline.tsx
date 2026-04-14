import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FeedItemCard } from "../components/FeedItemCard";
import { FilterBar } from "../components/FilterBar";
import { Loader2 } from "lucide-react";

interface ItemsResponse {
  items: Array<{
    id: string;
    itemType: string;
    title: string;
    body: string;
    url: string | null;
    authorName: string | null;
    publishedAt: string | null;
    status: string;
    starred: boolean;
    importance: string;
    tags: string[];
    sourceId: string | null;
    createdAt: string;
  }>;
  total: number;
}

interface StatsResponse {
  total: number;
  unread: number;
  starred: number;
}

export function FeedTimeline() {
  const [status, setStatus] = useState("unread");
  const [itemType, setItemType] = useState("");
  const [importance, setImportance] = useState("");

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (itemType) params.set("type", itemType);
  if (importance) params.set("importance", importance);
  params.set("limit", "100");

  const { data, isLoading } = useQuery({
    queryKey: ["items", status, itemType, importance],
    queryFn: () => api.get<ItemsResponse>(`/items?${params}`),
  });

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<StatsResponse>("/stats"),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <h1 className="text-lg font-bold text-zinc-100">Timeline</h1>
        {stats && (
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>{stats.unread} unread</span>
            <span>{stats.total} total</span>
            <span>{stats.starred} starred</span>
          </div>
        )}
      </div>

      <FilterBar
        status={status}
        onStatusChange={setStatus}
        itemType={itemType}
        onItemTypeChange={setItemType}
        importance={importance}
        onImportanceChange={setImportance}
      />

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {data?.items.length === 0 && !isLoading && (
          <div className="py-12 text-center text-sm text-zinc-500">
            No items found. Subscribe to a feed or save some items.
          </div>
        )}

        {data?.items.map((item) => (
          <FeedItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
