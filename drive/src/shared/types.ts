export type DriveOperation =
  | "items:read"
  | "items:write"
  | "items:delete"
  | "items:share"
  | "tokens:issue";

export type DriveItemKind = "folder" | "upload" | "doc" | "sheet" | "slide";

export type DriveView = "my-drive" | "recent" | "starred" | "shared" | "trash";

export type DrivePreviewKind =
  | "folder"
  | "native-doc"
  | "native-sheet"
  | "native-slide"
  | "text"
  | "image"
  | "pdf"
  | "audio"
  | "video"
  | "office"
  | "binary";

export interface DriveDocBlock {
  id: string;
  type: "heading" | "paragraph" | "bullet" | "table";
  text?: string;
  cells?: string[][];
}

export interface DriveDocContent {
  kind: "doc";
  blocks: DriveDocBlock[];
}

export interface DriveSheetTab {
  id: string;
  name: string;
  rows: string[][];
  freeze: {
    row: number;
    col: number;
  };
}

export interface DriveSheetContent {
  kind: "sheet";
  tabs: DriveSheetTab[];
}

export interface DriveSlide {
  id: string;
  title: string;
  body: string;
  notes: string;
  background: string;
}

export interface DriveSlideContent {
  kind: "slide";
  slides: DriveSlide[];
}

export type DriveNativeContent = DriveDocContent | DriveSheetContent | DriveSlideContent;

export interface DriveUploadContent {
  kind: "upload";
  previewKind: DrivePreviewKind;
  sourceUrl?: string;
  textContent?: string;
  metadata?: Record<string, unknown>;
}

export interface DriveItem {
  id: string;
  name: string;
  kind: DriveItemKind;
  parentId: string | null;
  mimeType: string | null;
  sizeBytes: number;
  starred: boolean;
  trashedAt: string | null;
  previewKind: DrivePreviewKind;
  previewText: string;
  currentRevisionId: string | null;
  childCount: number;
  commentCount: number;
  revisionCount: number;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
}

export interface DriveItemDetail extends DriveItem {
  content: DriveNativeContent | DriveUploadContent | null;
  breadcrumbs: Array<{ id: string; name: string }>;
}

export interface DriveRevision {
  id: string;
  itemId: string;
  versionNumber: number;
  summary: string | null;
  previewText: string;
  createdAt: string;
  authorKind: "admin" | "token" | "share";
  authorId: string;
}

export interface DriveComment {
  id: string;
  itemId: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface DriveScopedTokenRecord {
  id: string;
  label: string;
  operations: DriveOperation[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface DriveShareRecord {
  id: string;
  itemId: string;
  label: string;
  mode: "read";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface DriveViewCounts {
  myDrive: number;
  recent: number;
  starred: number;
  shared: number;
  trash: number;
}
