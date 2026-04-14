import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, Trash2, ArrowLeft, Tag, Link2, Clock } from "lucide-react";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { CommentThread } from "../components/CommentThread";
import { RevisionHistory } from "../components/RevisionHistory";

type Page = {
  id: string;
  spaceId: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  parentPageId: string | null;
  tags: string[];
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type BacklinksResponse = {
  items: Page[];
  links: Array<{ id: string; sourcePageId: string; targetPageId: string; linkType: string }>;
};

export function PageView() {
  const { spaceId = "main", pageSlug = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: page, isLoading, error } = useQuery({
    queryKey: ["page", spaceId, pageSlug],
    queryFn: () => api.get<Page>(`/spaces/${spaceId}/pages/${pageSlug}`),
    enabled: !!pageSlug,
  });

  const { data: backlinks } = useQuery({
    queryKey: ["backlinks", spaceId, pageSlug],
    queryFn: () => api.get<BacklinksResponse>(`/spaces/${spaceId}/pages/${pageSlug}/backlinks`),
    enabled: !!pageSlug,
  });

  const deletePage = useMutation({
    mutationFn: () => api.del(`/spaces/${spaceId}/pages/${pageSlug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      navigate(`/${spaceId}`);
    },
  });

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-text-muted">Loading...</div>;
  }

  if (error || !page) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3">
        <p>Page not found</p>
        <Link to={`/${spaceId}`} className="text-primary text-[13px] hover:underline">
          Back to space
        </Link>
      </div>
    );
  }

  const updatedAgo = formatTimeAgo(page.updatedAt);
  const backlinkPages = backlinks?.items ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] text-text-muted mb-4">
          <Link to={`/${spaceId}`} className="hover:text-primary">
            <ArrowLeft size={12} className="inline mr-1" />
            {spaceId}
          </Link>
          <span>/</span>
          <span className="text-text">{page.title}</span>
        </div>

        {/* Title + actions */}
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-2xl font-bold">{page.title}</h1>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <Link
              to={`/${spaceId}/${pageSlug}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-text-muted border border-border rounded hover:bg-bg-hover transition-colors"
            >
              <Edit size={12} />
              Edit
            </Link>
            <button
              onClick={() => { if (confirm("Delete this page?")) deletePage.mutate(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-red border border-border rounded hover:bg-red/10 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-[12px] text-text-muted mb-6">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            Updated {updatedAgo}
          </span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            page.status === "published" ? "bg-green-bg text-green" :
            page.status === "draft" ? "bg-primary-bg text-primary" :
            "bg-bg-hover text-text-faint"
          }`}>
            {page.status}
          </span>
        </div>

        {/* Tags */}
        {page.tags.length > 0 && (
          <div className="flex items-center gap-1.5 mb-4">
            <Tag size={12} className="text-text-faint" />
            {page.tags.map((tag) => (
              <span key={tag} className="text-[11px] px-2 py-0.5 bg-primary-bg text-primary rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <MarkdownRenderer body={page.body} spaceId={spaceId} />

        {/* Backlinks */}
        {backlinkPages.length > 0 && (
          <div className="mt-8 border-t border-border pt-4">
            <h3 className="flex items-center gap-2 text-[13px] font-medium text-text-muted mb-3">
              <Link2 size={14} />
              Backlinks ({backlinkPages.length})
            </h3>
            <div className="space-y-1.5">
              {backlinkPages.map((bp) => (
                <Link
                  key={bp.id}
                  to={`/${bp.spaceId}/${bp.slug}`}
                  className="block text-[13px] text-primary hover:underline"
                >
                  {bp.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Revision history */}
        <RevisionHistory spaceId={spaceId} pageSlug={pageSlug} />

        {/* Comments */}
        <CommentThread spaceId={spaceId} pageSlug={pageSlug} />
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
