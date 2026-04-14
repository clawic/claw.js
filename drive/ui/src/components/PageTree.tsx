import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { FileText, FolderOpen } from "lucide-react";
import { api } from "../lib/api";

type Page = {
  id: string;
  slug: string;
  title: string;
  parentPageId: string | null;
  status: string;
};

export function PageTree() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { pageSlug } = useParams<{ pageSlug: string }>();

  const { data } = useQuery({
    queryKey: ["pages", spaceId],
    queryFn: () => api.get<{ items: Page[]; total: number }>(`/spaces/${spaceId ?? "main"}/pages`),
    enabled: true,
  });

  const pages = data?.items ?? [];

  // Build tree structure
  const rootPages = pages.filter((p) => !p.parentPageId);
  const childMap = new Map<string, Page[]>();
  for (const page of pages) {
    if (page.parentPageId) {
      const children = childMap.get(page.parentPageId) ?? [];
      children.push(page);
      childMap.set(page.parentPageId, children);
    }
  }

  function renderPage(page: Page, depth: number) {
    const children = childMap.get(page.id) ?? [];
    const isActive = page.slug === pageSlug;
    const space = spaceId ?? "main";

    return (
      <div key={page.id}>
        <Link
          to={`/${space}/${page.slug}`}
          className={`flex items-center gap-2 px-3 py-1.5 text-[13px] rounded mx-1.5 transition-colors ${
            isActive
              ? "bg-primary-bg text-primary font-medium"
              : "text-text-muted hover:bg-bg-hover hover:text-text"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {children.length > 0 ? (
            <FolderOpen size={14} className="flex-shrink-0 opacity-60" />
          ) : (
            <FileText size={14} className="flex-shrink-0 opacity-60" />
          )}
          <span className="truncate">{page.title}</span>
        </Link>
        {children.map((child) => renderPage(child, depth + 1))}
      </div>
    );
  }

  return (
    <nav className="py-1">
      {rootPages.map((page) => renderPage(page, 0))}
      {pages.length === 0 && (
        <p className="px-4 py-3 text-[13px] text-text-faint">No pages yet</p>
      )}
    </nav>
  );
}
