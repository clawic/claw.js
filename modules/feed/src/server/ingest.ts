import { XMLParser } from "fast-xml-parser";

import type { FeedStore } from "./db.ts";
import type { FeedChangeEvent, FeedSource, ItemType } from "../shared/types.ts";

interface RawFeedItem {
  externalId: string;
  title: string;
  body: string;
  url: string;
  authorName?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function extractRssItems(xml: string): RawFeedItem[] {
  const parsed = xmlParser.parse(xml);
  const items: RawFeedItem[] = [];

  // RSS 2.0
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) {
    const list = Array.isArray(rssItems) ? rssItems : [rssItems];
    for (const entry of list) {
      items.push({
        externalId: String(entry.guid ?? entry.link ?? entry.title ?? ""),
        title: String(entry.title ?? ""),
        body: String(entry.description ?? entry["content:encoded"] ?? ""),
        url: String(entry.link ?? ""),
        authorName: entry["dc:creator"] ?? entry.author ?? undefined,
        publishedAt: entry.pubDate ? new Date(entry.pubDate).toISOString() : undefined,
      });
    }
    return items;
  }

  // Atom
  const atomEntries = parsed?.feed?.entry;
  if (atomEntries) {
    const list = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    for (const entry of list) {
      const link = Array.isArray(entry.link)
        ? (entry.link.find((l: Record<string, string>) => l["@_rel"] === "alternate") ?? entry.link[0])
        : entry.link;
      const href = typeof link === "string" ? link : link?.["@_href"] ?? "";
      items.push({
        externalId: String(entry.id ?? href ?? entry.title ?? ""),
        title: typeof entry.title === "string" ? entry.title : String(entry.title?.["#text"] ?? entry.title ?? ""),
        body: String(entry.summary ?? entry.content?.["#text"] ?? entry.content ?? ""),
        url: String(href),
        authorName: entry.author?.name ?? undefined,
        publishedAt: entry.published ?? entry.updated ? new Date(entry.published ?? entry.updated).toISOString() : undefined,
      });
    }
    return items;
  }

  return items;
}

export class FeedIngester {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: FeedStore,
    private readonly emitChange: (event: FeedChangeEvent) => void,
  ) {}

  start(intervalMs: number = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.pollAll().catch((err) => {
        console.error("Feed poll error:", err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollSource(sourceId: string): Promise<{ added: number; errors: string[] }> {
    const source = this.store.getSource(sourceId);
    if (!source) return { added: 0, errors: ["Source not found"] };

    const errors: string[] = [];
    let added = 0;

    try {
      const rawItems = await this.fetchItems(source);
      for (const raw of rawItems) {
        const item = this.store.createItemIfNew({
          sourceId: source.id,
          itemType: this.inferItemType(source),
          externalId: raw.externalId,
          url: raw.url || undefined,
          title: raw.title || undefined,
          body: raw.body || undefined,
          authorName: raw.authorName,
          publishedAt: raw.publishedAt,
          thumbnailUrl: raw.thumbnailUrl,
          tags: source.tags.length > 0 ? [...source.tags] : undefined,
        });
        if (item) {
          added++;
          this.emitChange({
            type: "item.created",
            itemId: item.id,
            sourceId: source.id,
            payload: item,
            at: new Date().toISOString(),
          });
        }
      }
      this.store.updateSourcePolled(sourceId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      this.store.updateSourcePolled(sourceId, msg);
    }

    this.emitChange({
      type: "source.polled",
      sourceId,
      payload: { added, errors },
      at: new Date().toISOString(),
    });

    return { added, errors };
  }

  async pollAll(): Promise<{ results: Record<string, { added: number; errors: string[] }> }> {
    const due = this.store.getSourcesDueForPolling();
    const results: Record<string, { added: number; errors: string[] }> = {};
    for (const source of due) {
      results[source.slug] = await this.pollSource(source.id);
    }
    return { results };
  }

  private async fetchItems(source: FeedSource): Promise<RawFeedItem[]> {
    switch (source.sourceType) {
      case "rss":
      case "newsletter":
        return await this.fetchRss(source.url ?? "");
      default:
        return [];
    }
  }

  private async fetchRss(url: string): Promise<RawFeedItem[]> {
    if (!url) return [];
    const response = await fetch(url, {
      headers: { "User-Agent": "ClawJS-Feed/0.1" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
    }
    const xml = await response.text();
    return extractRssItems(xml);
  }

  private inferItemType(source: FeedSource): ItemType {
    switch (source.sourceType) {
      case "rss":
      case "newsletter":
        return "rss_entry";
      case "twitter_list":
        return "tweet";
      case "reddit_subreddit":
        return "reddit_post";
      case "youtube_channel":
        return "youtube_video";
      case "github_repo":
        return "github_repo";
      default:
        return "bookmark";
    }
  }
}
