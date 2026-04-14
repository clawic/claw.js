import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { api } from "../lib/api";

type Page = {
  id: string;
  slug: string;
  title: string;
  status: string;
  tags: string[];
  updatedAt: string;
};

export function SpaceHome() {
  const { spaceId = "main" } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["pages", spaceId],
    queryFn: () => api.get<{ items: Page[]; total: number }>(`/spaces/${spaceId}/pages`),
  });

  const pages = data?.items ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">{spaceId}</h1>
          <Link
            to={`/${spaceId}/new/edit`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded text-[13px] font-medium hover:opacity-90"
          >
            <Plus size={14} />
            New Page
          </Link>
        </div>

        {isLoading && <p className="text-text-muted text-[13px]">Loading...</p>}

        {!isLoading && pages.length === 0 && (
          <div className="text-center py-12 text-text-muted">
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-[14px]">No pages yet. Create the first one.</p>
          </div>
        )}

        <div className="space-y-2">
          {pages.map((page) => (
            <Link
              key={page.id}
              to={`/${spaceId}/${page.slug}`}
              className="flex items-center justify-between p-3 border border-border rounded hover:border-primary transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <FileText size={15} className="text-text-muted" />
                <span className="text-[14px] font-medium">{page.title}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                  page.status === "published" ? "bg-green-bg text-green" :
                  page.status === "draft" ? "bg-primary-bg text-primary" :
                  "bg-bg-hover text-text-faint"
                }`}>
                  {page.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {page.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-bg-hover text-text-muted rounded">
                    {tag}
                  </span>
                ))}
                <span className="text-[11px] text-text-faint ml-2">
                  {new Date(page.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
