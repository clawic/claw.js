import { Link } from "react-router-dom";
import {
  Star,
  BookOpen,
  Archive,
  ExternalLink,
  Clock,
} from "lucide-react";
import { SourceIcon } from "./SourceIcon";
import { TagBadge } from "./TagBadge";
import { api } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface FeedItemCardProps {
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
}

const IMPORTANCE_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  normal: "text-zinc-400",
  low: "text-zinc-600",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function FeedItemCard({ item }: FeedItemCardProps) {
  const qc = useQueryClient();

  const snippet = item.body.length > 200 ? item.body.slice(0, 200) + "..." : item.body;
  const isUnread = item.status === "unread";

  async function toggleStar(e: React.MouseEvent) {
    e.preventDefault();
    await api.post(`/items/${item.id}/star`);
    qc.invalidateQueries({ queryKey: ["items"] });
  }

  async function markRead(e: React.MouseEvent) {
    e.preventDefault();
    await api.post(`/items/${item.id}/read`);
    qc.invalidateQueries({ queryKey: ["items"] });
  }

  async function archive(e: React.MouseEvent) {
    e.preventDefault();
    await api.post(`/items/${item.id}/archive`);
    qc.invalidateQueries({ queryKey: ["items"] });
  }

  return (
    <Link
      to={`/items/${item.id}`}
      className={`block border-b border-zinc-800/60 px-5 py-3.5 transition-colors hover:bg-zinc-900/50 ${
        isUnread ? "bg-zinc-900/30" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <SourceIcon type={item.itemType} className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isUnread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-400" />
            )}
            <h3 className={`truncate text-sm font-semibold ${isUnread ? "text-zinc-100" : "text-zinc-300"}`}>
              {item.title || "(untitled)"}
            </h3>
            {item.importance !== "normal" && (
              <span className={`text-xs font-medium ${IMPORTANCE_COLORS[item.importance]}`}>
                {item.importance}
              </span>
            )}
          </div>

          {item.authorName && (
            <p className="mt-0.5 text-xs text-zinc-500">{item.authorName}</p>
          )}

          {snippet && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400 line-clamp-2">{snippet}</p>
          )}

          <div className="mt-2 flex items-center gap-2">
            {item.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}

            <span className="ml-auto flex items-center gap-1 text-xs text-zinc-600">
              <Clock className="h-3 w-3" />
              {timeAgo(item.publishedAt ?? item.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={toggleStar}
            className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-yellow-400"
            title="Star"
          >
            <Star className={`h-3.5 w-3.5 ${item.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
          </button>
          {isUnread && (
            <button
              onClick={markRead}
              className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              title="Mark read"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={archive}
            className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              title="Open original"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </Link>
  );
}
