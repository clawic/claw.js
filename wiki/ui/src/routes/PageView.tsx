import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    return (
      <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: "var(--color-text-faint)" }}>
        Loading...
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--color-text-muted)" }}>
        <p className="text-[14px]">Page not found</p>
        <Link to={`/${spaceId}`} className="text-[13px] hover:underline" style={{ color: "var(--color-primary)" }}>
          Back to space
        </Link>
      </div>
    );
  }

  const updatedAgo = formatTimeAgo(page.updatedAt);
  const backlinkPages = backlinks?.items ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div style={{ maxWidth: 708, margin: "0 auto", padding: "80px 48px 120px" }}>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "var(--color-text-faint)" }}>
          <Link to={`/${spaceId}`} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
            {spaceId}
          </Link>
          <span style={{ color: "var(--color-text-faint)" }}>/</span>
          <span style={{ color: "var(--color-text-muted)" }}>{page.title}</span>
        </div>

        {/* Title */}
        <h1
          className="font-bold"
          style={{ fontSize: "40px", lineHeight: 1.2, letterSpacing: "-0.04em", marginBottom: "2px" }}
        >
          {page.title}
        </h1>

        {/* Meta row */}
        <div
          className="flex items-center gap-3 mt-1 mb-1"
          style={{ fontSize: "12px", color: "var(--color-text-faint)" }}
        >
          <span>Updated {updatedAgo}</span>
          {page.status !== "published" && (
            <span
              className="px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{
                background: page.status === "draft" ? "var(--color-blue-bg)" : "var(--color-bg-active)",
                color: page.status === "draft" ? "var(--color-primary)" : "var(--color-text-faint)",
              }}
            >
              {page.status}
            </span>
          )}
        </div>

        {/* Tags */}
        {page.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1 mb-1">
            {page.tags.map((tag) => (
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

        {/* Actions - hover-revealed */}
        <div
          className="group flex items-center gap-1 mt-3 mb-6"
          style={{ color: "var(--color-text-faint)" }}
        >
          <Link
            to={`/${spaceId}/${pageSlug}/edit`}
            className="text-[12px] px-2 py-0.5 rounded transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Edit
          </Link>
          <button
            onClick={() => { if (confirm("Delete this page?")) deletePage.mutate(); }}
            className="text-[12px] px-2 py-0.5 rounded transition-colors border-0 bg-transparent cursor-pointer"
            style={{ color: "var(--color-text-muted)", fontFamily: "inherit" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Delete
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--color-border)", marginBottom: "24px" }} />

        {/* Body */}
        <MarkdownRenderer body={page.body} spaceId={spaceId} />

        {/* Backlinks */}
        {backlinkPages.length > 0 && (
          <div className="mt-12">
            <div
              className="text-[11px] font-semibold uppercase mb-2"
              style={{ letterSpacing: "0.06em", color: "var(--color-text-faint)" }}
            >
              Linked from
            </div>
            <div className="flex flex-col gap-0.5">
              {backlinkPages.map((bp) => (
                <Link
                  key={bp.id}
                  to={`/${bp.spaceId}/${bp.slug}`}
                  className="text-[13px] py-0.5 hover:underline"
                  style={{ color: "var(--color-text-muted)" }}
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
