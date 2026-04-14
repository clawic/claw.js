export interface ParsedWikilink {
  slug: string;
  display?: string;
}

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractWikilinks(body: string): ParsedWikilink[] {
  const results: ParsedWikilink[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = WIKILINK_RE.exec(body)) !== null) {
    const slug = match[1].trim().toLowerCase().replace(/\s+/g, "-");
    if (seen.has(slug)) continue;
    seen.add(slug);
    results.push({
      slug,
      display: match[2]?.trim(),
    });
  }

  return results;
}
