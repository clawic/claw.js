export type WikiPageStatus = "draft" | "published" | "archived";
export type WikiLinkType = "related" | "depends-on" | "supersedes" | "wikilink";

export interface WikiPage {
  id: string;
  spaceId: string;
  title: string;
  slug: string;
  body: string;
  status: WikiPageStatus;
  parentPageId: string | null;
  tags: string[];
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
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
  linkType: WikiLinkType;
  label: string | null;
  createdAt: string;
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

export interface WikiSearchResult {
  page: WikiPage;
  score: number;
  snippet?: string;
  depth?: number;
}

export interface CreateWikiPageInput {
  title: string;
  slug?: string;
  body?: string;
  status?: WikiPageStatus;
  parentPageId?: string;
  tags?: string[];
  createdByAgentId?: string;
  createdByUserId?: string;
}

export interface UpdateWikiPageInput {
  title?: string;
  slug?: string;
  body?: string;
  status?: WikiPageStatus;
  parentPageId?: string | null;
  tags?: string[];
  changeSummary?: string;
  editedByAgentId?: string;
  editedByUserId?: string;
}

export interface WikiSearchOptions {
  spaceId?: string;
  modes?: Array<"fts" | "graph">;
  weights?: { fts?: number; graph?: number };
  pageId?: string;
  depth?: number;
  limit?: number;
}

export interface WikiCommentInput {
  parentCommentId?: string;
  authorAgentId?: string;
  authorUserId?: string;
}

export interface WikiListPagesOptions {
  parentPageId?: string | null;
  status?: WikiPageStatus;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface WikiClientOptions {
  baseUrl: string;
  token?: string;
}
