import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { SourceIcon } from "../components/SourceIcon";
import { Plus, Loader2, RefreshCw } from "lucide-react";

interface Source {
  id: string;
  name: string;
  slug: string;
  sourceType: string;
  url: string | null;
  enabled: boolean;
  pollIntervalMinutes: number;
  lastPolledAt: string | null;
  lastError: string | null;
  itemCount: number;
  tags: string[];
}

export function SourceList() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("rss");
  const [url, setUrl] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.get<{ items: Source[] }>("/sources"),
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/sources", { name, sourceType, url });
    setShowForm(false);
    setName("");
    setUrl("");
    qc.invalidateQueries({ queryKey: ["sources"] });
  }

  async function pollSource(id: string) {
    await api.post(`/sources/${id}/poll`);
    qc.invalidateQueries({ queryKey: ["sources"] });
    qc.invalidateQueries({ queryKey: ["items"] });
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-100">Sources</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500"
        >
          <Plus className="h-3.5 w-3.5" />
          Add source
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-5 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex gap-3">
            <input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-brand-500"
            />
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-brand-500"
            >
              <option value="rss">RSS</option>
              <option value="twitter_list">Twitter</option>
              <option value="youtube_channel">YouTube</option>
              <option value="reddit_subreddit">Reddit</option>
              <option value="github_repo">GitHub</option>
              <option value="newsletter">Newsletter</option>
            </select>
          </div>
          <input
            placeholder="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((source) => (
          <div
            key={source.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700"
          >
            <div className="flex items-start justify-between">
              <Link to={`/sources/${source.id}`} className="flex items-center gap-2">
                <SourceIcon type={source.sourceType} className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-100">{source.name}</span>
              </Link>
              <button
                onClick={() => pollSource(source.id)}
                className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                title="Poll now"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-1 truncate text-xs text-zinc-500">{source.url ?? "Manual"}</p>

            <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
              <span>{source.itemCount} items</span>
              <span className={source.enabled ? "text-green-500" : "text-zinc-600"}>
                {source.enabled ? "Active" : "Disabled"}
              </span>
              {source.lastError && (
                <span className="text-red-400" title={source.lastError}>Error</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
