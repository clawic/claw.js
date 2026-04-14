import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FeedItemCard } from "../components/FeedItemCard";
import { Search, Loader2 } from "lucide-react";

interface SearchResult {
  item: {
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
  };
  snippet: string;
  rank: number;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => api.get<{ items: SearchResult[] }>(`/search?q=${encodeURIComponent(submitted)}`),
    enabled: submitted.length > 0,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(query);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-5 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items..."
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Search
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {submitted && data?.items.length === 0 && !isLoading && (
          <p className="py-12 text-center text-sm text-zinc-500">No results for "{submitted}"</p>
        )}

        {data?.items.map((result) => (
          <FeedItemCard key={result.item.id} item={result.item} />
        ))}
      </div>
    </div>
  );
}
