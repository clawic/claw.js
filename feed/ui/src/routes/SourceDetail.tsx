import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FeedItemCard } from "../components/FeedItemCard";
import { SourceIcon } from "../components/SourceIcon";
import { RefreshCw, Loader2 } from "lucide-react";

export function SourceDetail() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const qc = useQueryClient();

  const { data: source } = useQuery({
    queryKey: ["source", sourceId],
    queryFn: () => api.get<Record<string, unknown>>(`/sources/${sourceId}`),
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["source-items", sourceId],
    queryFn: () => api.get<{ items: Array<Record<string, unknown>>; total: number }>(`/sources/${sourceId}/items?limit=100`),
  });

  async function poll() {
    await api.post(`/sources/${sourceId}/poll`);
    qc.invalidateQueries({ queryKey: ["source", sourceId] });
    qc.invalidateQueries({ queryKey: ["source-items", sourceId] });
  }

  if (!source) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
        <SourceIcon type={String(source.sourceType)} className="h-5 w-5 text-zinc-400" />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-zinc-100">{String(source.name)}</h1>
          <p className="text-xs text-zinc-500">{String(source.url ?? "Manual source")}</p>
        </div>
        <button
          onClick={poll}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Poll now
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {items?.items.length === 0 && !isLoading && (
          <p className="py-12 text-center text-sm text-zinc-500">No items from this source yet.</p>
        )}

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {items?.items.map((item: any) => (
          <FeedItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
