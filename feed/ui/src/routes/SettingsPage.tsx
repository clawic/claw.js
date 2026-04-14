import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Key, Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";

interface Token {
  id: string;
  label: string;
  operations: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export function SettingsPage() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [operations, setOperations] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api.get<{ items: Token[] }>("/tokens"),
  });

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    const result = await api.post<{ plaintext: string }>("/tokens", {
      label: label || "token",
      operations: operations.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setNewToken(result.plaintext);
    setLabel("");
    setOperations("");
    qc.invalidateQueries({ queryKey: ["tokens"] });
  }

  async function revokeToken(tokenId: string) {
    await api.post(`/tokens/${tokenId}/revoke`);
    qc.invalidateQueries({ queryKey: ["tokens"] });
  }

  async function pollAll() {
    setPolling(true);
    try {
      await api.post("/ingest/poll-all");
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["sources"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } finally {
      setPolling(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="mb-6 text-lg font-bold text-zinc-100">Settings</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Polling</h2>
        <button
          onClick={pollAll}
          disabled={polling}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {polling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Poll all sources now
        </button>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">API Tokens</h2>

        <form onSubmit={createToken} className="mb-4 flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-zinc-500">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="my-agent"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-zinc-500">Operations (comma-separated)</label>
            <input
              value={operations}
              onChange={(e) => setOperations(e.target.value)}
              placeholder="items:create,items:list"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none"
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-3 w-3" />
            Create
          </button>
        </form>

        {newToken && (
          <div className="mb-4 rounded-md bg-green-900/20 px-3 py-2">
            <p className="text-xs text-green-400">Token created. Copy it now, it won't be shown again:</p>
            <code className="mt-1 block font-mono text-xs text-green-300">{newToken}</code>
          </div>
        )}

        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />}

        <div className="space-y-2">
          {tokens?.items.map((token) => (
            <div key={token.id} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <Key className="h-3.5 w-3.5 text-zinc-500" />
              <div className="flex-1">
                <span className="text-xs font-medium text-zinc-200">{token.label}</span>
                <span className="ml-2 text-xs text-zinc-600">
                  {token.operations.join(", ") || "all"}
                </span>
              </div>
              <span className="text-xs text-zinc-600">
                {token.lastUsedAt ? `Used ${new Date(token.lastUsedAt).toLocaleDateString()}` : "Never used"}
              </span>
              <button
                onClick={() => revokeToken(token.id)}
                className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                title="Revoke"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
