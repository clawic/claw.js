import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  evaluateRegulatedAction,
  type MediaDirection,
  type MediaExternalRef,
  type MediaGalleryShare,
  type MediaKind,
  type MediaListInput,
  type MediaOrigin,
  type MediaRecord,
  type MediaSearchResult,
  type MediaStorageRef,
  type RegulatedActionDecision,
} from "@clawjs/core";

import type { WorkspaceStorage } from "../data/store.ts";
import type { LocalStorageStore, StorageShare } from "../storage/store.ts";

export interface RegisterMediaInput {
  mediaId?: string;
  name?: string;
  mimeType?: string;
  kind?: MediaKind;
  data?: string | Uint8Array;
  filePath?: string;
  storage?: MediaStorageRef;
  external?: MediaExternalRef;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  messageId?: string;
  command?: string;
  origin?: MediaOrigin;
  direction?: MediaDirection;
  channel?: MediaRecord["channel"];
  sourceText?: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface MediaStore {
  register(input: RegisterMediaInput): MediaRecord;
  list(input?: MediaListInput): MediaRecord[];
  search(input: MediaListInput & { query: string }): MediaSearchResult[];
  get(mediaId: string): MediaRecord | null;
  download(mediaId: string): { media: MediaRecord; filePath: string; buffer: Buffer } | null;
  createObjectShare(input: { mediaId: string; label?: string; legalLabel?: string; approvalId?: string; expiresAt?: string | null; ttlMs?: number }): Promise<StorageShare>;
  createGalleryShare(input: { label?: string; legalLabel?: string; approvalId?: string; filters?: MediaListInput; expiresAt?: string | null; ttlMs?: number }): MediaGalleryShare;
  revokeShare(id: string): Promise<boolean>;
  listShares(): Array<StorageShare | MediaGalleryShare>;
  resolveGalleryShare(id: string): { share: MediaGalleryShare; items: MediaRecord[] } | null;
}

const MEDIA_COLLECTION = "media";
const MEDIA_GALLERY_SHARES_COLLECTION = "media-gallery-shares";

interface PersistedMediaGalleryShare extends MediaGalleryShare {
  mediaIds?: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function toBuffer(data: string | Uint8Array): Buffer {
  if (typeof data !== "string") return Buffer.from(data);
  const trimmed = data.trim();
  if (trimmed.startsWith("data:")) {
    const [, base64 = ""] = trimmed.split(",", 2);
    return Buffer.from(base64, "base64");
  }
  return Buffer.from(trimmed, "base64");
}

function safeName(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return (trimmed || fallback).replace(/[\/\\]/g, "-");
}

function kindFromMime(mimeType: string, fallback: MediaKind = "other"): MediaKind {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  if (
    lower.startsWith("text/")
    || lower === "application/pdf"
    || lower.includes("document")
    || lower.includes("spreadsheet")
    || lower.includes("presentation")
    || lower === "application/json"
  ) return "document";
  return fallback;
}

function mimeFromKind(kind: MediaKind | undefined): string {
  switch (kind) {
    case "image":
      return "image/*";
    case "audio":
      return "audio/*";
    case "video":
      return "video/*";
    case "animation":
      return "image/gif";
    case "document":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

function extensionFromName(name: string): string {
  return path.extname(name).replace(/^\./, "").toLowerCase() || "bin";
}

function storageUrl(storage: MediaStorageRef): string {
  return storage.url || `storage://${storage.bucket}/${storage.key}`;
}

function parseStorageUrl(value: string | undefined): MediaStorageRef | null {
  if (!value?.startsWith("storage://")) return null;
  const rest = value.slice("storage://".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);
  return { bucket, key, url: value };
}

function scoreMatch(record: MediaRecord, query: string): { score: number; snippet: string } {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return { score: 0, snippet: "" };
  const fields = [
    record.name,
    record.mimeType,
    record.kind,
    record.sourceText,
    record.agentId,
    record.sessionId,
    record.channel?.provider,
    record.channel?.targetId,
    record.channel?.threadId,
    record.external?.value,
  ].filter(Boolean).join(" ");
  const haystack = fields.toLowerCase();
  const occurrences = haystack.split(normalizedQuery).length - 1;
  if (occurrences <= 0) return { score: 0, snippet: "" };
  const source = (record.sourceText || record.name).replace(/\s+/g, " ").trim();
  const lower = source.toLowerCase();
  const index = lower.indexOf(normalizedQuery);
  if (index < 0) return { score: occurrences * 10, snippet: record.name };
  const start = Math.max(0, index - 60);
  const end = Math.min(source.length, index + query.length + 60);
  return {
    score: occurrences * 10,
    snippet: `${start > 0 ? "..." : ""}${source.slice(start, end).trim()}${end < source.length ? "..." : ""}`,
  };
}

function withinDateRange(record: MediaRecord, input: MediaListInput): boolean {
  const created = Date.parse(record.createdAt);
  if (input.from && created < Date.parse(input.from)) return false;
  if (input.to && created > Date.parse(input.to)) return false;
  return true;
}

function matches(record: MediaRecord, input: MediaListInput): boolean {
  if (input.kind && record.kind !== input.kind) return false;
  if (input.direction && record.direction !== input.direction) return false;
  if (input.origin && record.origin !== input.origin) return false;
  if (input.agentId && record.agentId !== input.agentId) return false;
  if (input.workspaceId && record.workspaceId !== input.workspaceId) return false;
  if (input.projectId && record.projectId !== input.projectId) return false;
  if (input.sessionId && record.sessionId !== input.sessionId) return false;
  if (input.provider && record.channel?.provider !== input.provider) return false;
  if (input.accountId && record.channel?.accountId !== input.accountId) return false;
  if (input.targetId && record.channel?.targetId !== input.targetId) return false;
  if (input.threadId && record.channel?.threadId !== input.threadId) return false;
  if (!withinDateRange(record, input)) return false;
  if (input.query && scoreMatch(record, input.query).score <= 0) return false;
  return true;
}

function normalizeExpiresAt(input: { expiresAt?: string | null; ttlMs?: number }): string | null {
  if (input.expiresAt === null) return null;
  if (typeof input.expiresAt === "string" && input.expiresAt.trim()) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid media share expiration: ${input.expiresAt}`);
    return parsed.toISOString();
  }
  if (input.ttlMs !== undefined) {
    if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error("Media share ttlMs must be positive.");
    return new Date(Date.now() + input.ttlMs).toISOString();
  }
  return null;
}

function shareExpired(share: MediaGalleryShare): boolean {
  return Boolean(share.expiresAt && Date.parse(share.expiresAt) <= Date.now());
}

function requireMediaShareReview(input: { approvalId?: string; legalLabel?: string }): { approvalId: string; legalLabel: string; policy: RegulatedActionDecision } {
  const approvalId = input.approvalId?.trim() ?? "";
  const legalLabel = input.legalLabel?.trim() ?? "";
  const policy = evaluateRegulatedAction({
    regulatedDomain: "identity",
    decisionEffect: "external_action",
    requestedUse: "non_final_draft",
    externalAction: true,
    sensitiveExport: true,
    policyConfig: {
      confirmed: Boolean(approvalId && legalLabel),
      approvalId,
      legalLabel,
      materialConsent: Boolean(approvalId && legalLabel),
      destinationAuthorized: Boolean(approvalId && legalLabel),
    },
  });
  if (policy.policyDecision === "block") {
    throw new Error(`Media share creation is blocked by regulated safety policy: ${policy.reasonCodes.join(", ") || "blocked"}.`);
  }
  if (!policy.allowed && !approvalId) throw new Error("Media share creation requires explicit approvalId before export/share.");
  if (!policy.allowed && !legalLabel) throw new Error("Media share creation requires a persistent legalLabel before export/share.");
  if (!policy.allowed) throw new Error(`Media share creation requires policy confirmation before export/share: ${policy.requirements.join(", ")}.`);
  return { approvalId, legalLabel, policy };
}

export function createMediaStore(options: {
  dataStore: WorkspaceStorage;
  storage: LocalStorageStore;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
}): MediaStore {
  const collection = options.dataStore.collection<MediaRecord>(MEDIA_COLLECTION);
  const galleryShares = options.dataStore.collection<PersistedMediaGalleryShare>(MEDIA_GALLERY_SHARES_COLLECTION);

  function findBySource(sourceType: string | undefined, sourceId: string | undefined): MediaRecord | null {
    if (!sourceType || !sourceId) return null;
    return collection.list().find((record) => record.sourceType === sourceType && record.sourceId === sourceId) ?? null;
  }

  function put(record: MediaRecord): MediaRecord {
    return collection.put(record.mediaId, record);
  }

  function hydrateStorage(input: RegisterMediaInput, mediaId: string, name: string, mimeType: string): {
    storage?: MediaStorageRef;
    sizeBytes?: number;
    sha256?: string;
  } {
    if (input.storage) {
      const object = options.storage.head({ bucket: input.storage.bucket, key: input.storage.key });
      return {
        storage: { ...input.storage, url: storageUrl(input.storage) },
        ...(object ? { sizeBytes: object.sizeBytes, sha256: object.sha256 } : {}),
      };
    }

    const storageFromExternal = parseStorageUrl(input.external?.value);
    if (storageFromExternal) {
      const object = options.storage.head({ bucket: storageFromExternal.bucket, key: storageFromExternal.key });
      return {
        storage: storageFromExternal,
        ...(object ? { sizeBytes: object.sizeBytes, sha256: object.sha256 } : {}),
      };
    }

    if (input.filePath) {
      const object = options.storage.putFile({
        key: `media/${mediaId}/${name}`,
        filePath: input.filePath,
        contentType: mimeType,
        visibility: "drive",
        metadata: {
          kind: "media",
          mediaId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      });
      return {
        storage: { bucket: object.bucket, key: object.key, url: `storage://${object.bucket}/${object.key}` },
        sizeBytes: object.sizeBytes,
        sha256: object.sha256,
      };
    }

    if (input.data !== undefined) {
      const buffer = toBuffer(input.data);
      const object = options.storage.put({
        key: `media/${mediaId}/${name}`,
        data: buffer,
        contentType: mimeType,
        visibility: "drive",
        metadata: {
          kind: "media",
          mediaId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      });
      return {
        storage: { bucket: object.bucket, key: object.key, url: `storage://${object.bucket}/${object.key}` },
        sizeBytes: object.sizeBytes,
        sha256: object.sha256,
      };
    }

    return {};
  }

  return {
    register(input) {
      const existing = findBySource(input.sourceType, input.sourceId);
      const mediaId = input.mediaId ?? existing?.mediaId ?? `media-${crypto.randomUUID()}`;
      const mimeType = input.mimeType?.trim() || existing?.mimeType || mimeFromKind(input.kind);
      const fallbackName = input.filePath ? path.basename(input.filePath) : `${mediaId}.${extensionFromName(mimeType)}`;
      const name = safeName(input.name ?? existing?.name, fallbackName);
      const kind = input.kind ?? kindFromMime(mimeType, existing?.kind);
      const persisted = hydrateStorage(input, mediaId, name, mimeType);
      const timestamp = nowIso();
      return put({
        mediaId,
        name,
        mimeType,
        kind,
        origin: input.origin ?? existing?.origin ?? "imported",
        direction: input.direction ?? existing?.direction ?? "internal",
        workspaceId: input.workspaceId ?? existing?.workspaceId ?? options.workspaceId,
        projectId: input.projectId ?? existing?.projectId ?? options.projectId,
        agentId: input.agentId ?? existing?.agentId ?? options.agentId,
        sessionId: input.sessionId ?? existing?.sessionId,
        messageId: input.messageId ?? existing?.messageId,
        command: input.command ?? existing?.command,
        channel: input.channel ?? existing?.channel,
        external: input.external ?? existing?.external,
        sourceText: input.sourceText ?? existing?.sourceText,
        sourceType: input.sourceType ?? existing?.sourceType,
        sourceId: input.sourceId ?? existing?.sourceId,
        metadata: {
          ...(existing?.metadata ?? {}),
          ...(input.metadata ?? {}),
        },
        shareIds: existing?.shareIds ?? [],
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        ...(persisted.storage ? { storage: persisted.storage } : existing?.storage ? { storage: existing.storage } : {}),
        ...(persisted.sizeBytes ?? existing?.sizeBytes ? { sizeBytes: persisted.sizeBytes ?? existing?.sizeBytes } : {}),
        ...(persisted.sha256 ?? existing?.sha256 ? { sha256: persisted.sha256 ?? existing?.sha256 } : {}),
      });
    },
    list(input = {}) {
      const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
      return collection.list()
        .filter((record) => matches(record, input))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name))
        .slice(0, limit);
    },
    search(input) {
      return this.list({ ...input, query: undefined, limit: 1000 })
        .map((record) => {
          const match = scoreMatch(record, input.query);
          return match.score > 0 ? { ...record, score: match.score, snippet: match.snippet } : null;
        })
        .filter((record): record is MediaSearchResult => record !== null)
        .sort((left, right) => right.score - left.score || right.createdAt.localeCompare(left.createdAt))
        .slice(0, Math.max(1, Math.min(input.limit ?? 100, 1000)));
    },
    get(mediaId) {
      return collection.get(mediaId.trim());
    },
    download(mediaId) {
      const media = this.get(mediaId);
      if (!media?.storage) return null;
      const object = options.storage.get({ bucket: media.storage.bucket, key: media.storage.key });
      if (!object) return null;
      return { media, filePath: object.filePath, buffer: object.buffer };
    },
    async createObjectShare(input) {
      const legal = requireMediaShareReview(input);
      const media = this.get(input.mediaId);
      if (!media?.storage) throw new Error(`Media has no stored object: ${input.mediaId}`);
      const share = await options.storage.createShare({
        bucket: media.storage.bucket,
        key: media.storage.key,
        label: input.label ?? media.name,
        legalLabel: legal.legalLabel,
        approvalId: legal.approvalId,
        expiresAt: input.expiresAt,
        ttlMs: input.ttlMs,
      });
      put({
        ...media,
        shareIds: Array.from(new Set([...media.shareIds, share.id])),
        updatedAt: nowIso(),
      });
      return share;
    },
    createGalleryShare(input) {
      const legal = requireMediaShareReview(input);
      const id = `media-share-${crypto.randomUUID()}`;
      const createdAt = nowIso();
      const filters = input.filters ?? {};
      const share: PersistedMediaGalleryShare = {
        id,
        label: input.label?.trim() || "Media gallery",
        legalLabel: legal.legalLabel,
        approvalId: legal.approvalId,
        url: `claw://media-gallery/${id}`,
        filters,
        mediaIds: this.list(filters).map((record) => record.mediaId),
        createdAt,
        expiresAt: normalizeExpiresAt(input),
      };
      return galleryShares.put(id, share);
    },
    async revokeShare(id) {
      const gallery = galleryShares.get(id);
      if (gallery && !gallery.revokedAt) {
        galleryShares.put(id, { ...gallery, revokedAt: nowIso() });
        return true;
      }
      return await options.storage.revokeShare(id);
    },
    listShares() {
      return [
        ...galleryShares.list().sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        ...options.storage.listShares(),
      ];
    },
    resolveGalleryShare(id) {
      const share = galleryShares.get(id);
      if (!share || share.revokedAt || shareExpired(share)) return null;
      const snapshotItems = Array.isArray(share.mediaIds)
        ? share.mediaIds.map((mediaId) => this.get(mediaId)).filter((record): record is MediaRecord => record !== null)
        : null;
      return {
        share,
        items: snapshotItems ?? this.list(share.filters),
      };
    },
  };
}
