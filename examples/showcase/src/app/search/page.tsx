"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Command, Database, Loader2, Search, ShieldAlert, SlidersHorizontal, Zap } from "lucide-react";

type SearchProfileId = "framework" | "full";

interface SearchResultView {
  id: string;
  source: string;
  domain: string;
  type: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  score: number;
  permissions?: { redacted?: boolean };
  actions?: Array<{ id: string; label: string; kind: string; requiresApproval?: boolean }>;
}

interface SearchQueryOutput {
  query: string;
  profile: SearchProfileId;
  results: SearchResultView[];
  partial: boolean;
  omittedSources: Array<{ source: string; reason: string; message?: string }>;
  elapsedMs: number;
}

const DOMAIN_OPTIONS = [
  { id: "", label: "All", icon: SlidersHorizontal },
  { id: "commands", label: "Commands", icon: Command },
  { id: "sessions", label: "Chats", icon: Search },
  { id: "database", label: "Database", icon: Database },
];

export default function RootSearchPage() {
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<SearchProfileId>("framework");
  const [domain, setDomain] = useState("");
  const [output, setOutput] = useState<SearchQueryOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (input: { query: string; profile: SearchProfileId; domain: string }) => {
    const trimmed = input.query.trim();
    if (!trimmed) {
      setOutput(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: trimmed,
        profile: input.profile,
        limit: "12",
        explain: "true",
      });
      if (input.domain) params.set("domains", input.domain);
      const res = await fetch(`/api/search/query?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setOutput(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runSearch({ query, profile, domain });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [domain, profile, query, runSearch]);

  const groupedResults = useMemo(() => output?.results ?? [], [output]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6" data-testid="root-search-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Search className="h-6 w-6" />
          Search
        </h1>
        <a
          href="/search-index"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Search Index
        </a>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
              placeholder="Search commands, chats, records, documents..."
              data-testid="root-search-input"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted p-1" data-testid="root-search-profile-tabs">
              {(["framework", "full"] as SearchProfileId[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setProfile(item)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    profile === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`root-search-profile-${item}`}
                >
                  {item === "framework" ? "Framework" : "Full"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {DOMAIN_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = domain === option.id;
                return (
                  <button
                    key={option.id || "all"}
                    type="button"
                    onClick={() => setDomain(option.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {output && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            {output.elapsedMs} ms
          </span>
          <span>{output.results.length} results</span>
          {output.partial && (
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4" />
              {output.omittedSources.length} omitted
            </span>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {groupedResults.length ? (
          <div className="divide-y divide-border">
            {groupedResults.map((result) => (
              <article key={result.id} className="grid gap-2 px-4 py-3 text-sm" data-testid={`root-search-result-${result.source}`}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-base font-medium text-foreground">{result.title}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{result.domain}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{result.type}</span>
                  {result.permissions?.redacted && (
                    <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
                      redacted
                    </span>
                  )}
                </div>
                {result.subtitle && <div className="truncate text-xs text-muted-foreground">{result.subtitle}</div>}
                {result.snippet && <p className="line-clamp-2 text-sm text-muted-foreground">{result.snippet}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">score {Math.round(result.score)}</span>
                  {result.actions?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {result.actions.slice(0, 2).map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          title={action.requiresApproval ? "Requires approval" : action.kind}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {query.trim() ? "No results" : "Search is ready"}
          </div>
        )}
      </div>
    </div>
  );
}
