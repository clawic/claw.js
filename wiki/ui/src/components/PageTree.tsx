import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

type Page = {
  id: string;
  slug: string;
  title: string;
  parentPageId: string | null;
  status: string;
};

const SLUG_ICONS: [string, string][] = [
  ["introduction", "\u{1F4C4}"],
  ["getting-started", "\u{1F44B}"],
  ["install", "\u{1F4BB}"],
  ["quick", "\u{1F680}"],
  ["surface", "\u{1F30D}"],
  ["runtime", "\u26A1"],
  ["relay", "\u{1F500}"],
  ["session", "\u{1F4AC}"],
  ["stream", "\u{1F4AC}"],
  ["api", "\u{1F4D6}"],
  ["architect", "\u{1F3DB}\uFE0F"],
  ["cli", "\u{1F4DF}"],
  ["interface", "\u{1F4CA}"],
  ["matrix", "\u{1F4CA}"],
  ["config", "\u2699\uFE0F"],
  ["agent", "\u{1F916}"],
  ["auth", "\u{1F510}"],
  ["deploy", "\u{1F4E6}"],
  ["database", "\u{1F5C3}\uFE0F"],
  ["test", "\u{1F9EA}"],
  ["debug", "\u{1F41B}"],
  ["webhook", "\u{1F514}"],
  ["setup", "\u{1F6E0}\uFE0F"],
];

function getIcon(slug: string): string {
  for (const [key, icon] of SLUG_ICONS) {
    if (slug.includes(key)) return icon;
  }
  return "\u{1F4C3}";
}

export function PageTree() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { pageSlug } = useParams<{ pageSlug: string }>();

  const { data } = useQuery({
    queryKey: ["pages", spaceId],
    queryFn: () => api.get<{ items: Page[]; total: number }>(`/spaces/${spaceId ?? "main"}/pages`),
    enabled: true,
  });

  const pages = data?.items ?? [];

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
    const hasChildren = children.length > 0;

    return (
      <div key={page.id}>
        <Link
          to={`/${space}/${page.slug}`}
          className="group flex items-center h-[30px] mx-1 rounded transition-colors"
          style={{
            paddingLeft: `${8 + depth * 18}px`,
            paddingRight: "8px",
            background: isActive ? "var(--color-bg-active)" : undefined,
            color: isActive ? "var(--color-text)" : "var(--color-text-muted)",
            fontWeight: isActive ? 500 : 400,
          }}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-bg-hover)"; }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
        >
          <span className="text-[16px] mr-1.5 flex-shrink-0 leading-none">{getIcon(page.slug)}</span>
          <span className="text-[13px] truncate flex-1">{page.title}</span>
          {hasChildren && (
            <span
              className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity ml-auto flex-shrink-0"
              style={{ color: "var(--color-text-muted)" }}
            >
              &#9662;
            </span>
          )}
        </Link>
        {children.map((child) => renderPage(child, depth + 1))}
      </div>
    );
  }

  return (
    <nav>
      {/* Section label */}
      {rootPages.length > 0 && (
        <div
          className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase"
          style={{ letterSpacing: "0.04em", color: "var(--color-text-faint)" }}
        >
          Pages
        </div>
      )}
      {rootPages.map((page) => renderPage(page, 0))}
      {pages.length === 0 && (
        <p className="px-3 py-4 text-[13px]" style={{ color: "var(--color-text-faint)" }}>
          No pages yet
        </p>
      )}
    </nav>
  );
}
