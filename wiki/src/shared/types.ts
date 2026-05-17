export type WikiOperation =
  | "pages:list"
  | "pages:read"
  | "pages:create"
  | "pages:update"
  | "pages:delete"
  | "comments:list"
  | "comments:create"
  | "comments:update"
  | "comments:delete"
  | "links:list"
  | "links:create"
  | "links:delete"
  | "search:query"
  | "realtime:subscribe"
  | "tokens:issue"
  | "tokens:revoke";

export type PageStatus = "draft" | "published" | "archived";

export type LinkType = "related" | "depends-on" | "supersedes" | "wikilink";

export interface WikiSpace {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface WikiPage {
  id: string;
  spaceId: string;
  title: string;
  slug: string;
  body: string;
  status: PageStatus;
  parentPageId: string | null;
  tags: string[];
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WikiRevision {
  id: string;
  pageId: string;
  revisionNumber: number;
  title: string;
  body: string;
  changeSummary: string | null;
  editedByAgentId: string | null;
  editedByUserId: string | null;
  createdAt: string;
}

export interface WikiComment {
  id: string;
  pageId: string;
  parentCommentId: string | null;
  body: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  upvotes: number;
  createdAt: string;
  updatedAt: string;
}

export interface WikiLink {
  id: string;
  sourcePageId: string;
  targetPageId: string;
  linkType: LinkType;
  label: string | null;
  createdAt: string;
}

export interface ScopedTokenRecord {
  id: string;
  label: string;
  spaceId: string | null;
  operations: WikiOperation[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface WikiChangeEvent {
  type:
    | "page.created"
    | "page.updated"
    | "page.deleted"
    | "comment.created"
    | "link.created"
    | "link.deleted";
  spaceId: string;
  pageId?: string;
  commentId?: string;
  linkId?: string;
  payload?: WikiPage | WikiComment | WikiLink;
  at: string;
}

export interface FtsSearchResult {
  page: WikiPage;
  snippet: string;
  rank: number;
}

export interface GraphSearchResult {
  page: WikiPage;
  depth: number;
  path: string[];
}

export interface CombinedSearchResult {
  page: WikiPage;
  score: number;
  snippet?: string;
  depth?: number;
}
