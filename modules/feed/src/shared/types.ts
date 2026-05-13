export type FeedOperation =
  | "sources:list"
  | "sources:read"
  | "sources:create"
  | "sources:update"
  | "sources:delete"
  | "items:list"
  | "items:read"
  | "items:create"
  | "items:update"
  | "items:delete"
  | "annotations:list"
  | "annotations:create"
  | "annotations:update"
  | "annotations:delete"
  | "collections:list"
  | "collections:read"
  | "collections:create"
  | "collections:update"
  | "collections:delete"
  | "search:query"
  | "ingest:trigger"
  | "realtime:subscribe"
  | "tokens:issue"
  | "tokens:revoke";

export type SourceType =
  | "rss"
  | "twitter_list"
  | "reddit_subreddit"
  | "youtube_channel"
  | "github_repo"
  | "newsletter"
  | "manual";

export type ItemType =
  // Social media
  | "tweet"
  | "instagram_post"
  | "reddit_post"
  | "reddit_comment"
  | "linkedin_post"
  | "mastodon_post"
  | "bluesky_post"
  | "threads_post"
  // Video
  | "youtube_video"
  | "vimeo_video"
  | "tiktok_video"
  // Audio
  | "podcast_episode"
  | "spotify_track"
  // Text / articles
  | "article"
  | "blog_post"
  | "newsletter"
  | "rss_entry"
  // Code
  | "github_repo"
  | "github_issue"
  | "github_pr"
  | "github_release"
  | "github_commit"
  | "github_gist"
  | "github_discussion"
  // Bookmarks / documents
  | "bookmark"
  | "document"
  | "image"
  | "note"
  // Research
  | "arxiv_paper"
  | "hackernews_post";

export type ItemStatus = "unread" | "read" | "archived";

export type Importance = "low" | "normal" | "high" | "critical";

export type AnnotationType =
  | "summary"
  | "sentiment"
  | "key_points"
  | "action_item"
  | "note"
  | "classification"
  | "translation"
  | "related_context";

export interface FeedSource {
  id: string;
  name: string;
  slug: string;
  sourceType: SourceType;
  url: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
  pollIntervalMinutes: number;
  lastPolledAt: string | null;
  lastError: string | null;
  itemCount: number;
  tags: string[];
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedItem {
  id: string;
  sourceId: string | null;
  itemType: ItemType;
  externalId: string | null;
  url: string | null;
  title: string;
  body: string;
  authorName: string | null;
  authorUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  meta: Record<string, unknown>;
  status: ItemStatus;
  starred: boolean;
  importance: Importance;
  tags: string[];
  savedByAgentId: string | null;
  saveReason: string | null;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  archivedAt: string | null;
}

export interface FeedAnnotation {
  id: string;
  itemId: string;
  agentId: string | null;
  annotationType: AnnotationType;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FeedCollection {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  isSmart: boolean;
  filter: Record<string, unknown> | null;
  sortOrder: string;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedCollectionItem {
  id: string;
  collectionId: string;
  itemId: string;
  position: number;
  addedAt: string;
  addedByAgentId: string | null;
}

export interface ScopedTokenRecord {
  id: string;
  label: string;
  operations: FeedOperation[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface FeedChangeEvent {
  type:
    | "item.created"
    | "item.updated"
    | "item.deleted"
    | "item.read"
    | "item.starred"
    | "item.archived"
    | "source.created"
    | "source.updated"
    | "source.deleted"
    | "source.polled"
    | "annotation.created"
    | "annotation.deleted"
    | "collection.created"
    | "collection.updated"
    | "collection.deleted";
  itemId?: string;
  sourceId?: string;
  annotationId?: string;
  collectionId?: string;
  payload?: unknown;
  at: string;
}

export interface FeedStats {
  total: number;
  unread: number;
  starred: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  byImportance: Record<string, number>;
}
