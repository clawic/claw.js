import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { TagBadge } from "../components/TagBadge";
import { SourceIcon } from "../components/SourceIcon";
import {
  Star,
  BookOpen,
  Archive,
  ExternalLink,
  ArrowLeft,
  MessageSquare,
  Plus,
} from "lucide-react";

interface Annotation {
  id: string;
  annotationType: string;
  body: string;
  data: Record<string, unknown>;
  agentId: string | null;
  createdAt: string;
}

interface ItemDetail {
  id: string;
  itemType: string;
  title: string;
  body: string;
  url: string | null;
  authorName: string | null;
  authorUrl: string | null;
  publishedAt: string | null;
  status: string;
  starred: boolean;
  importance: string;
  tags: string[];
  meta: Record<string, unknown>;
  saveReason: string | null;
  annotations: Annotation[];
  createdAt: string;
}

const ANNOTATION_COLORS: Record<string, string> = {
  summary: "border-blue-800",
  sentiment: "border-green-800",
  key_points: "border-purple-800",
  action_item: "border-orange-800",
  note: "border-zinc-700",
  classification: "border-cyan-800",
  translation: "border-pink-800",
  related_context: "border-yellow-800",
};

export function ItemView() {
  const { itemId } = useParams<{ itemId: string }>();
  const qc = useQueryClient();
  const [showAnnotateForm, setShowAnnotateForm] = useState(false);
  const [annotationType, setAnnotationType] = useState("note");
  const [annotationBody, setAnnotationBody] = useState("");

  const { data: item } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => api.get<ItemDetail>(`/items/${itemId}`),
  });

  if (!item) return null;

  async function toggleStar() {
    await api.post(`/items/${itemId}/star`);
    qc.invalidateQueries({ queryKey: ["item", itemId] });
  }

  async function markRead() {
    await api.post(`/items/${itemId}/read`);
    qc.invalidateQueries({ queryKey: ["item", itemId] });
  }

  async function archive() {
    await api.post(`/items/${itemId}/archive`);
    qc.invalidateQueries({ queryKey: ["item", itemId] });
  }

  async function addAnnotation(e: React.FormEvent) {
    e.preventDefault();
    await api.post(`/items/${itemId}/annotations`, {
      annotationType,
      body: annotationBody,
    });
    setAnnotationBody("");
    setShowAnnotateForm(false);
    qc.invalidateQueries({ queryKey: ["item", itemId] });
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto p-6">
        <Link
          to="/timeline"
          className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to timeline
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <SourceIcon type={item.itemType} className="h-5 w-5 text-zinc-400" />
            <h1 className="text-xl font-bold text-zinc-100">{item.title || "(untitled)"}</h1>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={toggleStar} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-yellow-400">
              <Star className={`h-4 w-4 ${item.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
            </button>
            <button onClick={markRead} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              <BookOpen className="h-4 w-4" />
            </button>
            <button onClick={archive} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              <Archive className="h-4 w-4" />
            </button>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        {item.authorName && (
          <p className="mt-1 text-sm text-zinc-500">
            by {item.authorUrl ? (
              <a href={item.authorUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300">
                {item.authorName}
              </a>
            ) : item.authorName}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {item.status}
          </span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {item.importance}
          </span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {item.itemType}
          </span>
          {item.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>

        {item.saveReason && (
          <div className="mt-3 rounded-md bg-brand-900/20 px-3 py-2 text-sm text-brand-300">
            Saved because: {item.saveReason}
          </div>
        )}

        <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {item.body}
        </div>

        {Object.keys(item.meta).length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase text-zinc-500">Metadata</h3>
            <pre className="mt-2 overflow-auto rounded-md bg-zinc-900 p-3 text-xs text-zinc-400">
              {JSON.stringify(item.meta, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 border-l border-zinc-800 overflow-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
            <MessageSquare className="h-4 w-4" />
            Annotations ({item.annotations.length})
          </h2>
          <button
            onClick={() => setShowAnnotateForm(!showAnnotateForm)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {showAnnotateForm && (
          <form onSubmit={addAnnotation} className="border-b border-zinc-800 p-4 space-y-2">
            <select
              value={annotationType}
              onChange={(e) => setAnnotationType(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 outline-none"
            >
              <option value="note">Note</option>
              <option value="summary">Summary</option>
              <option value="sentiment">Sentiment</option>
              <option value="key_points">Key Points</option>
              <option value="action_item">Action Item</option>
              <option value="classification">Classification</option>
              <option value="translation">Translation</option>
              <option value="related_context">Related Context</option>
            </select>
            <textarea
              value={annotationBody}
              onChange={(e) => setAnnotationBody(e.target.value)}
              placeholder="Write annotation..."
              rows={3}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none resize-none"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500"
            >
              Add
            </button>
          </form>
        )}

        <div className="space-y-0">
          {item.annotations.map((ann) => (
            <div key={ann.id} className={`border-l-2 ${ANNOTATION_COLORS[ann.annotationType] ?? "border-zinc-700"} border-b border-b-zinc-800/50 px-4 py-3`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400">{ann.annotationType}</span>
                {ann.agentId && <span className="text-xs text-zinc-600">by {ann.agentId}</span>}
              </div>
              <p className="mt-1 text-sm text-zinc-300">{ann.body}</p>
              {Object.keys(ann.data).length > 0 && (
                <pre className="mt-1 text-xs text-zinc-500">{JSON.stringify(ann.data)}</pre>
              )}
            </div>
          ))}

          {item.annotations.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-zinc-600">No annotations yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
