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

// ---------------------------------------------------------------------------
// Clawix extensions (v002 schema)
// ---------------------------------------------------------------------------

export type DriveAuditEventKind =
  | "item_uploaded"
  | "item_viewed"
  | "item_downloaded"
  | "item_updated"
  | "item_moved"
  | "item_trashed"
  | "item_restored"
  | "item_deleted"
  | "item_starred"
  | "item_unstarred"
  | "share_created"
  | "share_revoked"
  | "share_used"
  | "token_issued"
  | "token_revoked"
  | "agent_grant_used"
  | "thumbnail_generated"
  | "exif_extracted"
  | "ocr_completed"
  | "embedding_generated"
  | "folder_encrypted"
  | "folder_decrypted";

export interface DriveAuditEvent {
  id: string;
  kind: DriveAuditEventKind;
  itemId: string | null;
  principalKind: "admin" | "token" | "share" | "agent" | "system";
  principalId: string;
  principalName: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface DriveAuditFilter {
  kinds?: DriveAuditEventKind[];
  itemId?: string;
  principalId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export type DriveShareMode = "read" | "tailnet" | "public_tunnel" | "agent";

export type DriveAgentCapabilityKind =
  | "drive.item.read"
  | "drive.item.write"
  | "drive.item.delete"
  | "drive.item.share";

export interface DriveAgentCapability {
  kind: DriveAgentCapabilityKind;
  itemId: string | null;
  ttlMinutes: number;
}

export interface DriveAgentShareRecord {
  id: string;
  itemId: string;
  capability: DriveAgentCapability;
  reason: string | null;
  agentName: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  usedCount: number;
  lastUsedAt: string | null;
}

export interface DriveTailnetShareRecord {
  id: string;
  itemId: string;
  magicdnsName: string;
  tailnetNodeId: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface DriveTunnelShareRecord {
  id: string;
  itemId: string;
  tunnelUrl: string;
  tunnelPid: number | null;
  startedAt: string;
  stoppedAt: string | null;
  status: "starting" | "running" | "stopped" | "errored";
}

export interface DriveThumbnailRecord {
  itemId: string;
  size: 256 | 512;
  path: string;
  mimeType: string;
  createdAt: string;
}

export interface DriveExifRecord {
  itemId: string;
  takenAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  shutterSpeed: string | null;
  aperture: number | null;
  focalLength: number | null;
  latitude: number | null;
  longitude: number | null;
  orientation: number | null;
  width: number | null;
  height: number | null;
  raw: Record<string, unknown>;
}

export interface DriveEmbeddingRecord {
  itemId: string;
  modelId: string;
  dim: number;
  createdAt: string;
}

export interface DriveEncryptedFolderRecord {
  folderId: string;
  wrapStrategy: "vault.master";
  enabledAt: string;
  enabledBy: string;
}

export type DriveMimeClass = "image" | "video" | "audio" | "doc" | "code" | "archive" | "other";

export interface DriveSemanticSearchResult {
  itemId: string;
  score: number;
  item: DriveItem;
}

// ---------------------------------------------------------------------------
// Realtime wire format
// ---------------------------------------------------------------------------

export type DriveRealtimeEventKind =
  | "item.created"
  | "item.updated"
  | "item.moved"
  | "item.trashed"
  | "item.restored"
  | "item.deleted"
  | "share.created"
  | "share.revoked"
  | "comment.created"
  | "thumbnail.ready"
  | "exif.ready"
  | "ocr.ready"
  | "embedding.ready"
  | "audit.appended";

export interface DriveRealtimeEvent {
  kind: DriveRealtimeEventKind;
  itemId: string | null;
  parentId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface DriveRealtimeSubscriptionFilter {
  parentId?: string | null;
  itemId?: string;
  kinds?: DriveRealtimeEventKind[];
}
