import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Search, FileText } from "lucide-react";
import { api } from "../lib/api";

type SearchResult = {
  page: {
    id: string;
    slug: string;
    title: string;
    spaceId: string;
    status: string;
    tags: string[];
  };
  score: number;
  snippet?: string;
  depth?: number;
};

export function SearchPanel() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<"fts" | "combined">("fts");

  const { data, isLoading } = useQuery({
    queryKey: ["search", query, mode],
    queryFn: async () => {
      if (mode === "fts") {
        return api.get<{ items: SearchResult[] }>(`/search/fts?q=${encodeURIComponent(query)}`);
      }
      return api.post<{ items: SearchResult[] }>("/search", { query, modes: ["fts", "graph"] });
    },
    enabled: query.trim().length > 0,
  });

  const results = data?.items ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-6">Search</h1>

        <div className="flex gap-3 mb-6">
          <div className="flex-1 flex items-center gap-2 bg-bg-input border border-border rounded px-3 py-2">
            <Search size={16} className="text-text-muted" />
            <input
              type="text"
              placeholder="Search pages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-0 text-[14px]"
              autoFocus
            />
          </div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "fts" | "combined")}
            className="bg-bg-input border border-border rounded px-3 py-2 text-[13px] outline-0"
          >
            <option value="fts">Full-text</option>
            <option value="combined">Combined</option>
          </select>
        </div>

        {isLoading && <p className="text-text-muted text-[13px]">Searching...</p>}

        {!isLoading && query && results.length === 0 && (
          <p className="text-text-muted text-[13px]">No results found for "{query}"</p>
        )}

        <div className="space-y-3">
          {results.map((result) => (
            <Link
              key={result.page.id}
              to={`/${result.page.spaceId}/${result.page.slug}`}
              className="block p-4 bg-bg border border-border rounded hover:border-primary transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText size={14} className="text-text-muted" />
                <span className="font-medium text-[14px]">{result.page.title}</span>
                {result.score > 0 && (
                  <span className="text-[11px] text-text-faint ml-auto">
                    score: {result.score.toFixed(2)}
                  </span>
                )}
              </div>
              {result.snippet && (
                <p
                  className="text-[13px] text-text-muted mt-1 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              )}
              {result.page.tags.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {result.page.tags.map((tag) => (
                    <span key={tag} className="text-[11px] px-2 py-0.5 bg-primary-bg text-primary rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
