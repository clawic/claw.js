import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
      <div style={{ maxWidth: 708, margin: "0 auto", padding: "80px 48px 120px" }}>
        <div className="flex items-center justify-between mb-1">
          <h1
            className="font-bold"
            style={{ fontSize: "40px", letterSpacing: "-0.04em", lineHeight: 1.2 }}
          >
            {spaceId}
          </h1>
        </div>

        <div className="mb-8">
          <Link
            to={`/${spaceId}/new/edit`}
            className="inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span className="text-[16px] leading-none">+</span>
            New page
          </Link>
        </div>

        {isLoading && (
          <p className="text-[13px]" style={{ color: "var(--color-text-faint)" }}>Loading...</p>
        )}

        {!isLoading && pages.length === 0 && (
          <div className="text-center py-20" style={{ color: "var(--color-text-faint)" }}>
            <p className="text-[48px] mb-4 opacity-50">{"\u{1F4C4}"}</p>
            <p className="text-[14px]">No pages yet. Create the first one.</p>
          </div>
        )}

        <div>
          {pages.map((page) => (
            <Link
              key={page.id}
              to={`/${spaceId}/${page.slug}`}
              className="group flex items-center py-[6px] px-2 rounded transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span className="text-[18px] mr-2 leading-none flex-shrink-0">{"\u{1F4C3}"}</span>
              <span className="text-[14px] flex-1 truncate">{page.title}</span>
              <span
                className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--color-text-faint)" }}
              >
                {page.status !== "published" && (
                  <span className="mr-2">{page.status}</span>
                )}
                {new Date(page.updatedAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
