import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FeedItemCard } from "../components/FeedItemCard";
import { ArrowLeft, Loader2 } from "lucide-react";

interface CollectionDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  isSmart: boolean;
  itemCount: number;
}

export function CollectionView() {
  const { collectionId } = useParams<{ collectionId: string }>();

  const { data: collection } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => api.get<CollectionDetail>(`/collections/${collectionId}`),
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["collection-items", collectionId],
    queryFn: () => api.get<{ items: Array<Record<string, unknown>>; total: number }>(`/collections/${collectionId}/items?limit=100`),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-5 py-3">
        <Link
          to="/collections"
          className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="h-3 w-3" />
          Collections
        </Link>
        {collection && (
          <div>
            <h1 className="text-lg font-bold text-zinc-100">
              {collection.icon ? `${collection.icon} ` : ""}{collection.name}
            </h1>
            {collection.description && (
              <p className="text-xs text-zinc-500">{collection.description}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {items?.items.length === 0 && !isLoading && (
          <p className="py-12 text-center text-sm text-zinc-500">No items in this collection.</p>
        )}

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {items?.items.map((item: any) => (
          <FeedItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
