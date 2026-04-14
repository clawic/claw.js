import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type Comment = {
  id: string;
  pageId: string;
  parentCommentId: string | null;
  body: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  upvotes: number;
  createdAt: string;
  updatedAt: string;
};

interface Props {
  spaceId: string;
  pageSlug: string;
}

export function CommentThread({ spaceId, pageSlug }: Props) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["comments", spaceId, pageSlug],
    queryFn: () => api.get<{ items: Comment[] }>(`/spaces/${spaceId}/pages/${pageSlug}/comments`),
  });

  const addComment = useMutation({
    mutationFn: (input: { body: string; parentCommentId?: string }) =>
      api.post(`/spaces/${spaceId}/pages/${pageSlug}/comments`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", spaceId, pageSlug] });
      setNewComment("");
      setReplyTo(null);
    },
  });

  const upvote = useMutation({
    mutationFn: (commentId: string) => api.post(`/comments/${commentId}/upvote`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", spaceId, pageSlug] }),
  });

  const comments = data?.items ?? [];
  const rootComments = comments.filter((c) => !c.parentCommentId);
  const childMap = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const children = childMap.get(c.parentCommentId) ?? [];
      children.push(c);
      childMap.set(c.parentCommentId, children);
    }
  }

  function renderComment(comment: Comment, depth: number) {
    const children = childMap.get(comment.id) ?? [];
    const author = comment.authorAgentId ?? comment.authorUserId ?? "Anonymous";
    const ago = formatTimeAgo(comment.createdAt);

    return (
      <div key={comment.id} className="mt-3" style={{ marginLeft: `${depth * 24}px` }}>
        <div className="flex items-start gap-2.5">
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: "var(--color-bg-active)" }}
          >
            <span className="text-[11px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
              {author.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              <span className="font-medium" style={{ color: "var(--color-text)" }}>{author}</span>
              <span>{ago}</span>
            </div>
            <p className="text-[14px] mt-0.5" style={{ lineHeight: 1.6 }}>{comment.body}</p>
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => upvote.mutate(comment.id)}
                className="text-[12px] border-0 bg-transparent cursor-pointer transition-colors"
                style={{ color: "var(--color-text-faint)", fontFamily: "inherit" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-faint)")}
              >
                {comment.upvotes > 0 ? `\u25B2 ${comment.upvotes}` : "\u25B2"}
              </button>
              <button
                onClick={() => setReplyTo(comment.id)}
                className="text-[12px] border-0 bg-transparent cursor-pointer transition-colors"
                style={{ color: "var(--color-text-faint)", fontFamily: "inherit" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-faint)")}
              >
                Reply
              </button>
            </div>
            {replyTo === comment.id && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Write a reply..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newComment.trim()) {
                      addComment.mutate({ body: newComment, parentCommentId: comment.id });
                    }
                  }}
                  className="w-full border-0 rounded px-3 py-1.5 text-[13px] outline-0"
                  style={{ background: "var(--color-bg-input)", color: "var(--color-text)" }}
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
        {children.map((child) => renderComment(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="mt-12">
      <div
        className="text-[11px] font-semibold uppercase mb-3"
        style={{ letterSpacing: "0.06em", color: "var(--color-text-faint)" }}
      >
        Discussion ({comments.length})
      </div>

      {rootComments.map((c) => renderComment(c, 0))}

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          placeholder="Add a comment..."
          value={replyTo ? "" : newComment}
          onChange={(e) => { setReplyTo(null); setNewComment(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newComment.trim() && !replyTo) {
              addComment.mutate({ body: newComment });
            }
          }}
          className="flex-1 border-0 rounded px-3 h-[34px] text-[14px] outline-0"
          style={{ background: "var(--color-bg-input)", color: "var(--color-text)" }}
        />
        <button
          onClick={() => { if (newComment.trim() && !replyTo) addComment.mutate({ body: newComment }); }}
          disabled={!newComment.trim() || !!replyTo}
          className="px-3 h-[34px] rounded text-[13px] font-medium border-0 cursor-pointer transition-opacity disabled:opacity-30"
          style={{ background: "var(--color-primary)", color: "#fff", fontFamily: "inherit" }}
        >
          Reply
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
