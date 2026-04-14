import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, ThumbsUp, Reply } from "lucide-react";
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
      <div key={comment.id} className="mt-3" style={{ marginLeft: `${depth * 20}px` }}>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-primary-bg flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-primary">
              {author.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
              <span className="font-medium text-text">{author}</span>
              <span>{ago}</span>
            </div>
            <p className="text-[13.5px] mt-0.5 leading-relaxed">{comment.body}</p>
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => upvote.mutate(comment.id)}
                className="flex items-center gap-1 text-[12px] text-text-faint hover:text-primary transition-colors"
              >
                <ThumbsUp size={12} />
                {comment.upvotes > 0 && <span>{comment.upvotes}</span>}
              </button>
              <button
                onClick={() => setReplyTo(comment.id)}
                className="flex items-center gap-1 text-[12px] text-text-faint hover:text-primary transition-colors"
              >
                <Reply size={12} />
                Reply
              </button>
            </div>
            {replyTo === comment.id && (
              <div className="mt-2 flex gap-2">
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
                  className="flex-1 bg-bg-input border border-border rounded px-3 py-1.5 text-[13px] outline-0 focus:border-primary"
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
    <div className="mt-8 border-t border-border pt-6">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold mb-4">
        <MessageSquare size={16} />
        Discussion ({comments.length})
      </h3>

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
          className="flex-1 bg-bg-input border border-border rounded px-3 py-2 text-[13.5px] outline-0 focus:border-primary"
        />
        <button
          onClick={() => { if (newComment.trim() && !replyTo) addComment.mutate({ body: newComment }); }}
          disabled={!newComment.trim() || !!replyTo}
          className="px-4 py-2 bg-primary text-white rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-40"
        >
          Comment
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
