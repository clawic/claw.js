import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
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
      <div style={{ maxWidth: 708, margin: "0 auto", padding: "80px 48px 120px" }}>
        <h1
          className="font-bold mb-6"
          style={{ fontSize: "40px", letterSpacing: "-0.04em", lineHeight: 1.2 }}
        >
          Search
        </h1>

        <div className="flex gap-2 mb-8">
          <div
            className="flex-1 flex items-center gap-2 rounded px-3 h-[36px]"
            style={{ background: "var(--color-bg-input)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              placeholder="Type to search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-0 text-[14px]"
              style={{ color: "var(--color-text)" }}
              autoFocus
            />
          </div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "fts" | "combined")}
            className="border-0 rounded px-3 h-[36px] text-[13px] outline-0"
            style={{ background: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
          >
            <option value="fts">Full-text</option>
            <option value="combined">Combined</option>
          </select>
        </div>

        {isLoading && (
          <p className="text-[13px]" style={{ color: "var(--color-text-faint)" }}>Searching...</p>
        )}

        {!isLoading && query && results.length === 0 && (
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            No results for "{query}"
          </p>
        )}

        <div>
          {results.map((result) => (
            <Link
              key={result.page.id}
              to={`/${result.page.spaceId}/${result.page.slug}`}
              className="group block py-2 px-2 rounded transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="flex items-center gap-2">
                <span className="text-[16px] leading-none">{"\u{1F4C3}"}</span>
                <span className="text-[14px] font-medium">{result.page.title}</span>
                {result.score > 0 && (
                  <span className="text-[11px] ml-auto" style={{ color: "var(--color-text-faint)" }}>
                    {result.score.toFixed(2)}
                  </span>
                )}
              </div>
              {result.snippet && (
                <p
                  className="text-[13px] mt-0.5 ml-[28px] line-clamp-2"
                  style={{ color: "var(--color-text-muted)" }}
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              )}
              {result.page.tags.length > 0 && (
                <div className="flex gap-1 mt-1 ml-[28px]">
                  {result.page.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-1.5 py-0.5 rounded"
                      style={{ background: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
                    >
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
