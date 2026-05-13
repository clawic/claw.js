import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FolderOpen, Plus, Loader2, Sparkles } from "lucide-react";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  isSmart: boolean;
  itemCount: number;
}

export function CollectionList() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.get<{ items: Collection[] }>("/collections"),
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/collections", { name, description });
    setShowForm(false);
    setName("");
    setDescription("");
    qc.invalidateQueries({ queryKey: ["collections"] });
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-100">Collections</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500"
        >
          <Plus className="h-3.5 w-3.5" />
          New collection
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-5 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <input
            placeholder="Collection name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-brand-500"
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500">
              Create
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
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
        {data?.items.map((col) => (
          <Link
            key={col.id}
            to={`/collections/${col.id}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700"
          >
            <div className="flex items-center gap-2">
              {col.isSmart ? (
                <Sparkles className="h-4 w-4 text-purple-400" />
              ) : (
                <FolderOpen className="h-4 w-4 text-zinc-400" />
              )}
              <span className="text-sm font-semibold text-zinc-100">
                {col.icon ? `${col.icon} ` : ""}{col.name}
              </span>
            </div>
            {col.description && (
              <p className="mt-1 text-xs text-zinc-500">{col.description}</p>
            )}
            <p className="mt-2 text-xs text-zinc-600">{col.itemCount} items</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
